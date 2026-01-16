import { A, createAsync } from '@solidjs/router';
import { For, Suspense, createSignal, createEffect } from 'solid-js';
import { query } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';
import { asc, like, or, sql } from 'drizzle-orm';
import { SiteCard, SiteCardSkeleton } from '~/components/Card';
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

export default function Dashboard() {
    const [raw, setRaw] = createSignal('');
    const [q, setQ] = createSignal('');
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);

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
        <div class="mt-14 flex flex-col gap-16">
            <div class="self-end">
                <A href="/create-destination" class="bg-secondary px-4 py-2 rounded-md ">
                    Add New Destination
                </A>
            </div>
            <div class="flex flex-col gap-24">
                {/* Input Wrapper */}
                <div class="relative w-full max-w-xl mx-auto group">
                    {/* Search Icon (Absolute Left) */}
                    <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-zinc-500 group-focus-within:text-white transition-colors duration-300">
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
                        class="w-full bg-zinc-900/50 text-white border border-zinc-800 rounded-2xl py-3.5 pl-12 pr-12 shadow-lg shadow-black/40 focus:bg-zinc-900 focus:border-secondary focus:ring-1 focus:ring-secondary/50 outline-none placeholder:text-zinc-500 text-sm transition-all duration-300"
                        placeholder="Search..."
                    />
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Suspense
                        fallback={
                            <>
                                <SiteCardSkeleton />
                                <SiteCardSkeleton />
                                <SiteCardSkeleton />
                            </>
                        }
                    >
                        <For each={sites()?.destinations ?? []}>
                            {(site) => (
                                <SiteCard
                                    name={site.name}
                                    isWarehouse={site.is_warehouse}
                                    url={`/destination/${site.id}`}
                                />
                            )}
                        </For>
                    </Suspense>
                </div>
                <Suspense
                    fallback={
                        <div class="bg-brand border border-zinc-800/50 rounded-2xl px-6 py-4 shadow-2xl shadow-black">
                            <PaginationSkeleton />
                        </div>
                    }
                >
                    <div class="bg-brand border border-zinc-800/50 rounded-2xl px-6 py-4 shadow-2xl shadow-black">
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
