import { A, createAsync, useNavigate } from '@solidjs/router';
import { For, Suspense, createSignal, createEffect, Show } from 'solid-js';
import { query } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';
import { asc, like, or, sql } from 'drizzle-orm';
import { debounce } from '~/utils/debounce';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';

export const loadSites = query(async (q: string, limit: number, offset: number) => {
    'use server';

    const term = q?.trim();
    const pattern = term ? `%${term}%` : '';
    const filters = term ? or(like(Destination.name, pattern)) : undefined;

    const listQuery = db.select().from(Destination).orderBy(asc(Destination.name)).limit(limit).offset(offset);
    const destinations = await (filters ? listQuery.where(filters) : listQuery);

    const countQuery = db.select({ total: sql<number>`COUNT(*)`.as('total') }).from(Destination);
    const totalCount = await (filters ? countQuery.where(filters) : countQuery).then((rows) => rows[0]?.total ?? 0);

    return {
        destinations,
        totalCount,
    };
}, 'all-destinations-with-search');

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

    createEffect(() => {
        const result = sites();
        if (result) {
            setTotalCount(result.totalCount);
        }
    });

    createEffect(() => {
        const totalPages = Math.max(1, Math.ceil(totalCount() / pageSize()));
        if (page() > totalPages) {
            setPage(totalPages);
        }
    });

    return (
        <div class="mt-6 flex flex-col gap-8">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                {/* Input Wrapper */}
                <div class="relative w-full group md:flex-1">
                    {/* Search Icon (Absolute Left) */}
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
                <A href="/create-destination" class="bg-secondary text-brand px-4 py-2 rounded-md md:ml-4">
                    Add New Site
                </A>
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
        </div>
    );
}

const EmptyState = () => (
    <tr>
        <td colspan={1} class="py-16 text-center">
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
            </tr>
        )}
    </For>
);
