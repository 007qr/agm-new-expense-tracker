import { A, createAsync, query, useNavigate } from '@solidjs/router';
import { asc, sql } from 'drizzle-orm';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { db } from '~/drizzle/client';
import { EntityWarehouse } from '~/drizzle/schema';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';

const loadItems = query(async (limit: number, offset: number) => {
    'use server';

    const items = await db
        .select({
            id: EntityWarehouse.id,
            name: EntityWarehouse.name,
            unit: EntityWarehouse.unit,
            type: EntityWarehouse.type,
        })
        .from(EntityWarehouse)
        .orderBy(asc(EntityWarehouse.name))
        .limit(limit)
        .offset(offset);

    const totalCount = await db
        .select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(EntityWarehouse)
        .then((rows) => rows[0]?.total ?? 0);

    return { items, totalCount };
}, 'items-list');

export default function ItemsPage() {
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);

    const items = createAsync(() => loadItems(pageSize(), (page() - 1) * pageSize()));
    const navigate = useNavigate();
    const totalCount = () => items()?.totalCount ?? 0;

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-zinc-900 tracking-tight">Items</h1>
                    <p class="text-zinc-600 mt-2 text-base">
                        All items in the warehouse catalog.
                        <Suspense
                            fallback={<span class="ml-2 w-10 bg-zinc-200 h-4 inline-block rounded-md animate-pulse" />}
                        >
                            <span class="ml-2 text-zinc-500 text-sm">
                                {items()?.items ? `${items()!.totalCount} total` : ''}
                            </span>
                        </Suspense>
                    </p>
                </div>

                <A
                    href="/items/new"
                    class="bg-secondary text-brand px-4 py-2 rounded-md hover:bg-black/90 transition-colors"
                >
                    Add New Item
                </A>
            </div>

            <div class="bg-brand border border-zinc-200 rounded-2xl overflow-hidden shadow-xl shadow-black/5">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-200">
                                <th class="py-5 pl-8 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Item
                                </th>
                                <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Type
                                </th>
                                <th class="py-5 pl-4 pr-8 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Unit
                                </th>
                                <th class="py-5 pr-8 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Actions
                                </th>
                            </tr>
                        </thead>

                        <tbody class="divide-y divide-zinc-200">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show when={items()?.items?.length} fallback={<EmptyState />}>
                                    <For each={items()?.items}>
                                        {(item) => (
                                            <tr
                                                class="group cursor-pointer hover:bg-zinc-50 transition-colors duration-200"
                                                role="link"
                                                tabindex={0}
                                                onClick={() => navigate(`/items/${item.id}`)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        navigate(`/items/${item.id}`);
                                                    }
                                                }}
                                            >
                                                <td class="py-5 pl-8 pr-4">
                                                    <A
                                                        class="text-sm font-medium text-zinc-900 hover:text-zinc-700 transition-colors"
                                                        href={`/items/${item.id}`}
                                                    >
                                                        {item.name}
                                                    </A>
                                                </td>

                                                <td class="py-5 px-4 text-sm text-zinc-700">{item.type}</td>

                                                <td class="py-5 pl-4 pr-8 text-right text-sm text-zinc-700">
                                                    {item.unit}
                                                </td>

                                                <td class="py-5 pr-8 text-right">
                                                    <div
                                                        class="inline-flex items-center gap-2"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <A
                                                            href={`/items/${item.id}/edit`}
                                                            class="text-xs font-semibold text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-lg px-3 py-1.5 transition-colors"
                                                        >
                                                            Edit
                                                        </A>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </Show>
                            </Suspense>
                        </tbody>
                    </table>
                </div>

                <Suspense
                    fallback={
                        <div class="border-t border-zinc-200 px-6 py-4">
                            <PaginationSkeleton />
                        </div>
                    }
                >
                    <Show when={totalCount() > 0}>
                        <div class="border-t border-zinc-200 px-6 py-4">
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
                    </Show>
                </Suspense>
            </div>
        </div>
    );
}

const EmptyState = () => (
    <tr>
        <td colspan={4} class="py-16 text-center">
            <div class="flex flex-col items-center justify-center gap-3">
                <div class="p-3 bg-zinc-50 rounded-full border border-zinc-200">
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
                <p class="text-zinc-600 text-sm font-medium">No items found</p>
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
                    <div class="h-4 w-20 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 pl-4 pr-8 text-right">
                    <div class="h-4 w-12 bg-zinc-200 rounded inline-block"></div>
                </td>
                <td class="py-5 pr-8 text-right">
                    <div class="h-4 w-20 bg-zinc-200 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
