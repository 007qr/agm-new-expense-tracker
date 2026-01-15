import { createAsync, query, useParams } from '@solidjs/router';
import { desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { For, Show, Suspense } from 'solid-js';
import { db } from '~/drizzle/client';
import { Destination, EntityVariantWarehouse, EntityWarehouse, WarehouseTransaction } from '~/drizzle/schema';

export const loadTransactions = query(async (dest: string) => {
    'use server';

    const variantDetails = sql<string>`
        ${EntityVariantWarehouse.length} || ' ' || ${EntityVariantWarehouse.dimension_unit} || ' x ' ||
        ${EntityVariantWarehouse.width}  || ' ' || ${EntityVariantWarehouse.dimension_unit} || ' x ' ||
        ${EntityVariantWarehouse.height} || ' ' || ${EntityVariantWarehouse.dimension_unit} || ' x ' ||
        ${EntityVariantWarehouse.thickness} || ' ' || ${EntityVariantWarehouse.thickness_unit}
    `;

    const sourceDestination = alias(Destination, 'source_destination');
    const targetDestination = alias(Destination, 'target_destination');

    const transactions = await db
        .select({
            created_at: WarehouseTransaction.created_at,
            type: WarehouseTransaction.type,
            quantity: WarehouseTransaction.quantity,
            entity_name: EntityWarehouse.name,
            variant_formatted: variantDetails,
            source_name: sourceDestination.name,
            destination_name: targetDestination.name,
            source_id: WarehouseTransaction.source_id,
            destination_id: WarehouseTransaction.destination_id,
        })
        .from(WarehouseTransaction)
        .leftJoin(EntityWarehouse, eq(WarehouseTransaction.entity_id, EntityWarehouse.id))
        .leftJoin(EntityVariantWarehouse, eq(WarehouseTransaction.entity_variant_id, EntityVariantWarehouse.id))
        .leftJoin(sourceDestination, eq(WarehouseTransaction.source_id, sourceDestination.id))
        .leftJoin(targetDestination, eq(WarehouseTransaction.destination_id, targetDestination.id))
        .where(or(eq(WarehouseTransaction.destination_id, dest), eq(WarehouseTransaction.source_id, dest)))
        .orderBy(desc(WarehouseTransaction.created_at));

    const destination = db.select({ name: Destination.name }).from(Destination).where(eq(Destination.id, dest));

    return {
        transactions,
        destination: await destination.then((rows) => rows[0]?.name ?? 'Unknown'),
    };
}, 'transactions-by-destination-id');

export default function LedgerPage() {
    const params = useParams<{ id: string }>();
    const transactions = createAsync(() => loadTransactions(params.id));
    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Ledger</h1>
                    <p class="text-zinc-400 mt-2 text-base">
                        Transactions for Destination{' '}
                        <Suspense
                            fallback={
                                <span class="w-20 bg-zinc-800/50 h-4 inline-block rounded-md align-middle animate-pulse"></span>
                            }
                        >
                            <span class="font-mono text-zinc-300 underline">{transactions()?.destination}</span>
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
                                    Date
                                </th>
                                <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Type
                                </th>
                                <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Route
                                </th>
                                <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Entity
                                </th>
                                <th class="py-5 px-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Quantity
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-800/50">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show
                                    when={transactions()?.transactions && transactions()!.transactions.length > 0}
                                    fallback={<EmptyState />}
                                >
                                    <For each={transactions()?.transactions}>
                                        {(transaction) => {
                                            const entityLabel = () => {
                                                const name = transaction.entity_name ?? 'Unknown';
                                                return transaction.variant_formatted
                                                    ? `${name} ${transaction.variant_formatted}`
                                                    : name;
                                            };

                                            const typeLabel = () => {
                                                const isCurrentSource = transaction.source_id === params.id;
                                                const isCurrentDestination = transaction.destination_id === params.id;
                                                if (!transaction.type) {
                                                    return '-';
                                                }
                                                if (isCurrentDestination && !isCurrentSource) {
                                                    return transaction.type === 'credit' ? 'debit' : 'credit';
                                                }
                                                return transaction.type;
                                            };

                                            const routeLabel = () => {
                                                const isCurrentSource = transaction.source_id === params.id;
                                                const currentName =
                                                    transactions()?.destination ??
                                                    (isCurrentSource ? transaction.source_name : transaction.destination_name) ??
                                                    'Unknown';
                                                const otherName = isCurrentSource
                                                    ? transaction.destination_name ?? 'Unknown'
                                                    : transaction.source_name ?? 'Unknown';
                                                const displayType = typeLabel();
                                                const arrow =
                                                    displayType === 'debit' ? '->' : displayType === 'credit' ? '<-' : '->';
                                                return `${currentName} ${arrow} ${otherName}`;
                                            };

                                            const quantityValue = () => {
                                                const value = Number(transaction.quantity ?? 0);
                                                return Number.isFinite(value) ? value.toLocaleString() : '0';
                                            };

                                            return (
                                                <tr class="group hover:bg-white/2 transition-colors duration-200">
                                                    <td class="py-5 pl-8 pr-4 text-sm text-zinc-300">
                                                        {transaction.created_at
                                                            ? new Date(transaction.created_at).toLocaleDateString()
                                                            : '-'}
                                                    </td>
                                                    <td class="py-5 px-4">
                                                        <span
                                                            class={`text-xs font-semibold uppercase ${
                                                                typeLabel() === 'debit'
                                                                    ? 'text-red-500'
                                                                    : 'text-green-400'
                                                            }`}
                                                        >
                                                            {typeLabel()}
                                                        </span>
                                                    </td>
                                                    <td class="py-5 px-4 text-sm text-zinc-300">{routeLabel()}</td>
                                                    <td class="py-5 px-4 text-sm text-white">{entityLabel()}</td>
                                                    <td class="py-5 px-4 text-right text-sm text-white">
                                                        {quantityValue()}
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
        <td colspan={6} class="py-16 text-center">
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
                <p class="text-zinc-500 text-sm font-medium">No ledger entries found</p>
            </div>
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={Array.from({ length: 5 })}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-5 pl-8 pr-4">
                    <div class="h-4 w-24 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-16 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-40 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-36 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 px-4 text-right">
                    <div class="h-4 w-12 bg-zinc-800/50 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
