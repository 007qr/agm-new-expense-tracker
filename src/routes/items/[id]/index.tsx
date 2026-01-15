import { createAsync, query, useNavigate, useParams } from '@solidjs/router';
import { and, eq, or, sql } from 'drizzle-orm';
import { For, Show, Suspense } from 'solid-js';
import { db } from '~/drizzle/client';
import { Destination, EntityWarehouse, WarehouseTransaction } from '~/drizzle/schema';

const netBalanceForAllDestinations = query(async (itemId: string) => {
    'use server';

    const balances = await db
        .select({
            destination_id: Destination.id,
            destination_name: Destination.name,
            net_quantity: sql<number>`SUM(
                CASE
                    WHEN ${WarehouseTransaction.destination_id} = ${Destination.id}
                    THEN COALESCE(CAST(${WarehouseTransaction.quantity} as REAL), 0)
                    WHEN ${WarehouseTransaction.source_id} = ${Destination.id}
                    THEN -COALESCE(CAST(${WarehouseTransaction.quantity} as REAL), 0)
                    ELSE 0
                END
            )`.as('net_quantity'),
        })
        .from(Destination)
        .leftJoin(
            WarehouseTransaction,
            and(
                eq(WarehouseTransaction.entity_id, itemId),
                or(
                    eq(WarehouseTransaction.destination_id, Destination.id),
                    eq(WarehouseTransaction.source_id, Destination.id),
                ),
            ),
        )
        .groupBy(Destination.id, Destination.name)
        .orderBy(Destination.name);

    const item = await db
        .select({ name: EntityWarehouse.name, unit: EntityWarehouse.unit })
        .from(EntityWarehouse)
        .where(eq(EntityWarehouse.id, itemId))
        .then((rows) => rows[0] ?? null);

    return {
        balances,
        item: item ?? { name: 'Unknown Item', unit: 'Units' },
    };
}, 'net-entity-for-all-dest');

export default function DestinationNetBalance() {
    const params = useParams<{ id: string }>();
    const balances = createAsync(() => netBalanceForAllDestinations(params.id));
    const navigate = useNavigate();

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Destination Net Balance</h1>
                    <p class="text-zinc-400 mt-2 text-base">
                        Net quantity for{' '}
                        <Suspense
                            fallback={
                                <span class="w-20 bg-zinc-800/50 h-4 inline-block rounded-md align-middle animate-pulse"></span>
                            }
                        >
                            <span class="font-mono text-zinc-300 underline">{balances()?.item.name}</span>
                        </Suspense>
                    </p>
                </div>
            </div>

            <div class="bg-brand border border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl shadow-black">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-800">
                                <th class="py-5 pl-8 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Destination
                                </th>
                                <th class="py-5 pl-4 pr-8 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Net Quantity
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-800/50">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show
                                    when={balances()?.balances && balances()!.balances.length > 0}
                                    fallback={<EmptyState />}
                                >
                                    <For each={balances()?.balances}>
                                        {(row) => {
                                            const quantity = () => {
                                                const value = Number(row.net_quantity ?? 0);
                                                return Number.isFinite(value) ? value.toLocaleString() : '0';
                                            };

                                            return (
                                                <tr
                                                    class="group cursor-pointer hover:bg-white/2 transition-colors duration-200"
                                                    role="link"
                                                    tabindex={0}
                                                    onClick={() => navigate(`/destination/${row.destination_id}`)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            navigate(`/destination/${row.destination_id}`);
                                                        }
                                                    }}
                                                >
                                                    <td class="py-5 pl-8 pr-4 text-sm text-white">
                                                        {row.destination_name}
                                                    </td>
                                                    <td class="py-5 pl-4 pr-8 text-right">
                                                        <span
                                                            class={`text-sm font-medium ${
                                                                (row.net_quantity ?? 0) < 0
                                                                    ? 'text-red-400'
                                                                    : 'text-white'
                                                            }`}
                                                        >
                                                            {quantity()}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                </Show>
                            </Suspense>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const EmptyState = () => (
    <tr>
        <td colspan={2} class="py-16 text-center">
            <div class="flex flex-col items-center justify-center gap-3">
                <div class="p-3 bg-zinc-900 rounded-full border border-zinc-800">
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
                <p class="text-zinc-500 text-sm font-medium">No destination balances found</p>
            </div>
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={Array.from({ length: 5 })}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-5 pl-8 pr-4">
                    <div class="h-4 w-40 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 pl-4 pr-8 text-right">
                    <div class="h-4 w-16 bg-zinc-800/50 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
