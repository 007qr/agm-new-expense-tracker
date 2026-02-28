import { action, createAsync, revalidate, useNavigate, useSubmission } from '@solidjs/router';
import { For, Suspense, createSignal, createEffect, onCleanup, onMount, Show } from 'solid-js';
import { query } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import { debounce } from '~/utils/debounce';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';
import Sheet from '~/components/Sheet';
import { createDestination } from '~/routes/create-destination';
import { requireAuth } from '~/lib/require-auth';

export const loadSites = query(async (q: string, limit: number, offset: number) => {
    'use server';

    const term = q?.trim();
    const pattern = term ? `%${term}%` : '';
    const filters = term ? or(ilike(Destination.name, pattern)) : undefined;

    const listQuery = db.select().from(Destination).orderBy(asc(Destination.name)).limit(limit).offset(offset);
    const destinations = await (filters ? listQuery.where(filters) : listQuery);

    const countQuery = db.select({ total: sql<number>`COUNT(*)`.as('total') }).from(Destination);
    const totalCount = await (filters ? countQuery.where(filters) : countQuery).then((rows) => rows[0]?.total ?? 0);

    return { destinations, totalCount };
}, 'all-destinations-with-search');

export const updateDestination = action(async (formData: FormData): Promise<{ success: boolean; error?: string }> => {
    'use server';
    await requireAuth(['expense-user', 'warehouse-user']);

    const id = String(formData.get('id') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const isWarehouse = formData.get('is_warehouse') === 'on';

    if (!id) return { success: false, error: 'Site ID is missing.' };
    if (!name) return { success: false, error: 'Site name is required.' };

    try {
        await db.update(Destination).set({ name, is_warehouse: isWarehouse }).where(eq(Destination.id, id));
        return { success: true };
    } catch (e: any) {
        if (e.code === '23505') return { success: false, error: 'This site name is already taken.' };
        console.error('Database error:', e);
        return { success: false, error: 'System error. Please try again.' };
    }
});

export default function SitesPage() {
    const [raw, setRaw] = createSignal('');
    const [q, setQ] = createSignal('');
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);
    const navigate = useNavigate();

    const push = debounce((v: string) => setQ(v), 550);

    createEffect(() => push(raw()));

    createEffect(() => {
        q();
        setPage(1);
    });

    const sites = createAsync(() => loadSites(q(), pageSize(), (page() - 1) * pageSize()));
    const [totalCount, setTotalCount] = createSignal(0);

    // Create sheet state
    const [sheetOpen, setSheetOpen] = createSignal(false);
    const submission = useSubmission(createDestination);
    const [isWarehouse, setIsWarehouse] = createSignal(false);

    // Edit sheet state
    const [editSheetOpen, setEditSheetOpen] = createSignal(false);
    const [editingId, setEditingId] = createSignal('');
    const [editName, setEditName] = createSignal('');
    const [editIsWarehouse, setEditIsWarehouse] = createSignal(false);
    const updateSubmission = useSubmission(updateDestination);

    const openEditSheet = (site: { id: string; name: string; is_warehouse: boolean }) => {
        setEditingId(site.id);
        setEditName(site.name);
        setEditIsWarehouse(site.is_warehouse);
        setEditSheetOpen(true);
    };

    createEffect(() => {
        const result = sites();
        if (result) setTotalCount(result.totalCount);
    });

    createEffect(() => {
        const totalPages = Math.max(1, Math.ceil(totalCount() / pageSize()));
        if (page() > totalPages) setPage(totalPages);
    });

    createEffect(() => {
        if (submission.result?.success) {
            setSheetOpen(false);
            setIsWarehouse(false);
            revalidate('all-destinations-with-search');
        }
    });

    // Guard against stale success result on re-open
    let prevUpdateResult = updateSubmission.result;
    createEffect(() => {
        const result = updateSubmission.result;
        if (result !== prevUpdateResult && result?.success) {
            prevUpdateResult = result;
            setEditSheetOpen(false);
            revalidate('all-destinations-with-search');
        }
    });

    onMount(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.code !== 'KeyA') return;
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement ||
                (e.target as HTMLElement).isContentEditable
            ) return;
            e.preventDefault();
            setSheetOpen(true);
        };
        document.addEventListener('keydown', handleKeyDown);
        onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    });

    return (
        <div class="mt-6 flex flex-col gap-8">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                {/* Search bar */}
                <div class="relative w-full group md:flex-1">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-zinc-500 group-focus-within:text-black transition-colors duration-300">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="w-5 h-5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                            />
                        </svg>
                    </div>
                    <input
                        value={raw()}
                        onInput={(e) => setRaw(e.currentTarget.value)}
                        class="w-full bg-white text-black border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-12 shadow-lg shadow-black/5 focus:bg-white focus:border-secondary focus:ring-1 focus:ring-black/10 outline-none placeholder:text-zinc-500 text-sm transition-all duration-300"
                        placeholder="Search sites..."
                    />
                </div>
                <button
                    onClick={() => setSheetOpen(true)}
                    class="bg-secondary text-brand px-4 py-2 rounded-md md:ml-4"
                >
                    Add New Site
                </button>
            </div>

            <div class="flex w-full flex-col gap-8">
                <div class="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl shadow-black/5">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b border-zinc-200">
                                    <th class="py-5 pl-8 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        Site
                                    </th>
                                    <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        Type
                                    </th>
                                    <th class="py-5 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-200">
                                <Suspense fallback={<TableSkeleton />}>
                                    <Show when={(sites()?.destinations ?? []).length > 0} fallback={<EmptyState />}>
                                        <For each={sites()?.destinations ?? []}>
                                            {(site) => (
                                                <tr
                                                    class="group cursor-pointer hover:bg-zinc-50 transition-colors duration-200"
                                                    role="link"
                                                    tabindex={0}
                                                    onClick={() => navigate(`/expenses/${site.id}/ledger`)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            navigate(`/expenses/${site.id}/ledger`);
                                                        }
                                                    }}
                                                >
                                                    <td class="py-5 pl-8 pr-4 text-sm font-medium text-black">
                                                        {site.name}
                                                    </td>
                                                    <td class="py-5 px-4 text-sm text-zinc-500">
                                                        {site.is_warehouse ? 'Godown' : 'Site'}
                                                    </td>
                                                    <td class="py-5 pr-6 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditSheet(site);
                                                            }}
                                                            class="text-xs font-semibold text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-lg px-3 py-1.5 transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </Show>
                                </Suspense>
                            </tbody>
                        </table>
                    </div>
                </div>

                <Suspense
                    fallback={
                        <div class="bg-white border border-zinc-200 rounded-2xl px-6 py-4 shadow-2xl shadow-black/5">
                            <PaginationSkeleton />
                        </div>
                    }
                >
                    <div class="bg-white border border-zinc-200 rounded-2xl px-6 py-4 shadow-2xl shadow-black/5">
                        <Pagination
                            page={page()}
                            pageSize={pageSize()}
                            totalCount={totalCount()}
                            onPageChange={setPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                        />
                    </div>
                </Suspense>
            </div>

            {/* New Site Sheet */}
            <Sheet open={sheetOpen()} onClose={() => setSheetOpen(false)} title="New Site / Godown">
                <form action={createDestination} method="post" class="space-y-4">
                    <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                        <label
                            for="name"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 select-none group-focus-within:text-zinc-700 transition-colors"
                        >
                            Destination Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            required
                            autofocus={true}
                            placeholder="e.g. Pune Central Hub"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 transition-colors"
                        />
                    </div>

                    <div
                        class="flex items-center justify-between px-3.5 py-3 bg-white border border-zinc-200 rounded-xl cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
                        onClick={() => setIsWarehouse(!isWarehouse())}
                    >
                        <span class="text-sm font-medium text-zinc-700 group-hover:text-black transition-colors">
                            Is this a godown?
                        </span>
                        <input type="checkbox" name="is_warehouse" checked={isWarehouse()} class="hidden" />
                        <ToggleSwitch on={isWarehouse()} />
                    </div>

                    <Show when={submission.result?.success === false}>
                        <div class="px-3 py-2 bg-red-500/10 border border-red-500/10 rounded-lg flex items-center gap-2.5">
                            <div class="w-1 h-1 bg-red-500 rounded-full" />
                            <p class="text-[11px] text-red-400 font-medium leading-none">{submission.result?.error}</p>
                        </div>
                    </Show>

                    <button
                        type="submit"
                        disabled={submission.pending}
                        class="w-full bg-secondary hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-brand font-semibold text-sm rounded-xl py-3 transition-all active:scale-[0.98]"
                    >
                        {submission.pending ? 'Creating...' : 'Create'}
                    </button>
                </form>
            </Sheet>

            {/* Edit Site Sheet */}
            <Sheet open={editSheetOpen()} onClose={() => setEditSheetOpen(false)} title="Edit Site">
                <form action={updateDestination} method="post" class="space-y-4">
                    <input type="hidden" name="id" value={editingId()} />

                    <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                        <label
                            for="edit-name"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 select-none group-focus-within:text-zinc-700 transition-colors"
                        >
                            Site Name
                        </label>
                        <input
                            id="edit-name"
                            name="name"
                            type="text"
                            required
                            value={editName()}
                            onInput={(e) => setEditName(e.currentTarget.value)}
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 transition-colors"
                        />
                    </div>

                    <div
                        class="flex items-center justify-between px-3.5 py-3 bg-white border border-zinc-200 rounded-xl cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
                        onClick={() => setEditIsWarehouse(!editIsWarehouse())}
                    >
                        <span class="text-sm font-medium text-zinc-700 group-hover:text-black transition-colors">
                            Is this a godown?
                        </span>
                        <input type="checkbox" name="is_warehouse" checked={editIsWarehouse()} class="hidden" />
                        <ToggleSwitch on={editIsWarehouse()} />
                    </div>

                    <Show when={updateSubmission.result?.success === false}>
                        <div class="px-3 py-2 bg-red-500/10 border border-red-500/10 rounded-lg flex items-center gap-2.5">
                            <div class="w-1 h-1 bg-red-500 rounded-full" />
                            <p class="text-[11px] text-red-400 font-medium leading-none">{updateSubmission.result?.error}</p>
                        </div>
                    </Show>

                    <button
                        type="submit"
                        disabled={updateSubmission.pending}
                        class="w-full bg-secondary hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-brand font-semibold text-sm rounded-xl py-3 transition-all active:scale-[0.98]"
                    >
                        {updateSubmission.pending ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>
            </Sheet>
        </div>
    );
}

function ToggleSwitch(props: { on: boolean }) {
    return (
        <div
            class="relative w-9 h-5 rounded-full transition-colors duration-200"
            classList={{ 'bg-black': props.on, 'bg-zinc-300': !props.on }}
        >
            <div
                class="absolute top-1 left-1 w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200"
                classList={{ 'translate-x-4 bg-white': props.on, 'translate-x-0 bg-zinc-600': !props.on }}
            />
        </div>
    );
}

const EmptyState = () => (
    <tr>
        <td colspan={3} class="py-16 text-center">
            <div class="flex flex-col items-center justify-center gap-3">
                <div class="p-3 bg-zinc-100 rounded-full border border-zinc-200">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 text-zinc-500"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                        />
                    </svg>
                </div>
                <p class="text-zinc-500 text-sm font-medium">No sites found</p>
            </div>
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={Array.from({ length: 6 })}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-5 pl-8 pr-4">
                    <div class="h-4 w-40 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-16 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 pr-6 text-right">
                    <div class="h-4 w-12 bg-zinc-200 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
