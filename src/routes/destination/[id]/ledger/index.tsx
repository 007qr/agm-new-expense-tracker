import { action, createAsync, query, redirect, useLocation, useParams, useSubmission } from '@solidjs/router';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createEffect, createSignal, For, Show, Suspense } from 'solid-js';
import { db } from '~/drizzle/client';
import { Destination, EntityVariantWarehouse, EntityWarehouse, WarehouseTransaction } from '~/drizzle/schema';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';

export const loadTransactions = query(async (dest: string, entity: string, limit: number, offset: number) => {
    'use server';

    const entityFilter = entity?.trim();

    const variantDetails = sql<string>`
        NULLIF(
            TRIM(
                COALESCE(
                    NULLIF(CONCAT_WS(' x ',
                        (CASE WHEN ${EntityVariantWarehouse.length} IS NOT NULL AND ${EntityVariantWarehouse.length}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.length}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END),
                        (CASE WHEN ${EntityVariantWarehouse.width} IS NOT NULL AND ${EntityVariantWarehouse.width}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.width}::text, '')  || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END),
                        (CASE WHEN ${EntityVariantWarehouse.height} IS NOT NULL AND ${EntityVariantWarehouse.height}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.height}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END)
                    ), ''),
                    ''
                )
                ||
                (CASE
                    WHEN
                        NULLIF(CONCAT_WS(' x ',
                            (CASE WHEN ${EntityVariantWarehouse.length} IS NOT NULL AND ${EntityVariantWarehouse.length}::numeric > 0 THEN 'L' END),
                            (CASE WHEN ${EntityVariantWarehouse.width} IS NOT NULL AND ${EntityVariantWarehouse.width}::numeric > 0 THEN 'W' END),
                            (CASE WHEN ${EntityVariantWarehouse.height} IS NOT NULL AND ${EntityVariantWarehouse.height}::numeric > 0 THEN 'H' END)
                        ), '') IS NOT NULL
                        AND
                        (${EntityVariantWarehouse.thickness} IS NOT NULL AND ${EntityVariantWarehouse.thickness}::numeric > 0)
                    THEN ' thickness '
                    ELSE ''
                END)
                ||
                COALESCE(
                    NULLIF(
                        (CASE WHEN ${EntityVariantWarehouse.thickness} IS NOT NULL AND ${EntityVariantWarehouse.thickness}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.thickness}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.thickness_unit}, '')) ELSE NULL END),
                    ''),
                    ''
                )
            ),
        '')
    `;

    const sourceDestination = alias(Destination, 'source_destination');
    const targetDestination = alias(Destination, 'target_destination');
    const baseFilter = or(eq(WarehouseTransaction.destination_id, dest), eq(WarehouseTransaction.source_id, dest));
    const filters = entityFilter ? and(baseFilter, eq(WarehouseTransaction.entity_id, entityFilter)) : baseFilter;

    const transactions = await db
        .select({
            id: WarehouseTransaction.id,
            created_at: WarehouseTransaction.created_at,
            type: WarehouseTransaction.type,
            quantity: WarehouseTransaction.quantity,
            entity_name: EntityWarehouse.name,
            unit: EntityWarehouse.unit,
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
        .where(filters)
        .orderBy(desc(WarehouseTransaction.created_at))
        .limit(limit)
        .offset(offset);

    const totalCount = await db
        .select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(WarehouseTransaction)
        .where(filters)
        .then((rows) => rows[0]?.total ?? 0);

    const destination = db.select({ name: Destination.name }).from(Destination).where(eq(Destination.id, dest));

    return {
        transactions,
        destination: await destination.then((rows) => rows[0]?.name ?? 'Unknown'),
        totalCount,
    };
}, 'transactions-by-destination-id');

type ActionResponse = {
    success: boolean;
    error?: string;
};

export const deleteTransaction = action(async (formData: FormData): Promise<ActionResponse> => {
    'use server';

    const rawId = formData.get('id');
    const rawDest = formData.get('dest');
    const rawEntity = formData.get('entity');
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    const dest = typeof rawDest === 'string' ? rawDest.trim() : '';
    const entity = typeof rawEntity === 'string' ? rawEntity.trim() : '';

    if (!id) {
        return { success: false, error: 'Transaction id is missing.' };
    }

    try {
        await db.delete(WarehouseTransaction).where(eq(WarehouseTransaction.id, id));
        const search = entity ? `?entity=${encodeURIComponent(entity)}` : '';
        throw redirect(dest ? `/destination/${dest}/ledger${search}` : '/dashboard');
    } catch (error: unknown) {
        if (error instanceof Response) throw error;
        console.error('Database error:', error);
        return { success: false, error: 'System error. Please try again.' };
    }
});

const formatVariantDetails = (value: string) =>
    value.replace(/-?\d+(\.\d+)?/g, (match) => {
        const num = Number(match);
        if (!Number.isFinite(num)) return match;
        return num.toFixed(3).replace(/\.?0+$/, '');
    });

export default function LedgerPage() {
    const params = useParams<{ id: string }>();
    const location = useLocation();
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);
    const entityFilter = () => new URLSearchParams(location.search).get('entity') ?? '';
    const transactions = createAsync(() =>
        loadTransactions(params.id, entityFilter(), pageSize(), (page() - 1) * pageSize()),
    );
    const totalCount = () => transactions()?.totalCount ?? 0;
    const deletion = useSubmission(deleteTransaction);

    createEffect(() => {
        entityFilter();
        setPage(1);
    });

    createEffect(() => {
        const totalPages = Math.max(1, Math.ceil(totalCount() / pageSize()));
        if (page() > totalPages) {
            setPage(totalPages);
        }
    });

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex items-center justify-between">
                <div class="space-y-2">
                    <h1 class="text-3xl font-bold text-black tracking-tight">Material Abstract</h1>

                    <Suspense fallback={<span class="block w-32 h-4 bg-zinc-200 rounded-md animate-pulse" />}>
                        <p class="text-base text-zinc-600">
                            Site name:
                            <span class="ml-1 font-medium text-zinc-900">{transactions()?.destination}</span>
                        </p>
                    </Suspense>
                </div>
            </div>

            <div class="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl shadow-black/5">
                <Show when={deletion.result?.success === false}>
                    <div class="px-6 py-3 bg-red-500/10 border-b border-red-500/10 text-sm text-red-400">
                        {deletion.result?.error}
                    </div>
                </Show>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-200">
                                <th class="py-5 px-4 text-xs font-bold border-r border-zinc-200 uppercase tracking-wider text-zinc-800">
                                    Sr no.
                                </th>
                                <th class="py-5 pl-8 pr-4 text-xs border-r border-zinc-200   font-bold uppercase tracking-wider text-zinc-800">
                                    Date
                                </th>
                                <th class="py-5 px-4 text-xs font-bold uppercase  border-r border-zinc-200  tracking-wider text-zinc-800">
                                    Type
                                </th>
                                <th class="py-5 px-4 text-xs font-bold uppercase  border-r border-zinc-200  tracking-wider text-zinc-800">
                                    From/To
                                </th>
                                <th class="py-5 px-4 text-xs font-bold border-r border-zinc-200  uppercase tracking-wider text-zinc-800">
                                    Item
                                </th>
                                <th class="py-5 px-4 text-xs font-bold border-r border-zinc-200  uppercase tracking-wider text-zinc-800">
                                    Size
                                </th>
                                <th class="py-5 px-4 text-right text-xs border-r border-zinc-200 font-bold uppercase tracking-wider text-zinc-800">
                                    Quantity
                                </th>
                                <th class="py-5 px-4 text-right text-xs border-r border-zinc-200 font-bold uppercase tracking-wider text-zinc-800">
                                    Unit
                                </th>
                                <th class="py-5 pr-8 text-right text-xs  border-r border-zinc-200 font-bold uppercase tracking-wider text-zinc-800">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-200">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show
                                    when={transactions()?.transactions && transactions()!.transactions.length > 0}
                                    fallback={<EmptyState />}
                                >
                                    <For each={transactions()?.transactions}>
                                        {(transaction, index) => {
                                            const entityLabel = () => {
                                                const name = transaction.entity_name ?? 'Unknown';
                                                return name;
                                            };

                                            const variant = () => {
                                                const variant = transaction.variant_formatted
                                                    ? formatVariantDetails(transaction.variant_formatted)
                                                    : '--';
                                                return variant;
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

                                                const otherName = isCurrentSource
                                                    ? (transaction.destination_name ?? 'Unknown')
                                                    : (transaction.source_name ?? 'Unknown');

                                                return `${otherName}`;
                                            };

                                            const quantityValue = () => {
                                                const value = Number(transaction.quantity ?? 0);
                                                return Number.isFinite(value) ? value.toLocaleString() : '0';
                                            };

                                            return (
                                                <tr class="group hover:bg-zinc-50 transition-colors duration-200">
                                                    <td class="py-5 border-r border-zinc-200  pl-8 text-sm text-zinc-700">
                                                        {index() + 1}
                                                    </td>
                                                    <td class="py-5 border-r border-zinc-200  pl-8 pr-4 text-sm text-zinc-700">
                                                        {transaction.created_at
                                                            ? new Date(transaction.created_at).toLocaleDateString()
                                                            : '-'}
                                                    </td>
                                                    <td class="py-5 px-4  border-r border-zinc-200 ">
                                                        <span class="text-xs  text-zinc-700 uppercase">
                                                            {typeLabel() === 'debit' ? 'Outward' : 'Inward'}
                                                        </span>
                                                    </td>
                                                    <td class="py-5 px-4  border-r border-zinc-200  text-sm text-zinc-700">
                                                        {routeLabel()}
                                                    </td>
                                                    <td class="py-5 px-4 border-r border-zinc-200  text-sm text-black">
                                                        {entityLabel()}
                                                    </td>
                                                    <td class="py-5 px-4  border-r border-zinc-200  text-sm text-black">
                                                        {variant()}
                                                    </td>
                                                    <td class="py-5 px-4 border-r border-zinc-200  text-right text-sm text-black">
                                                        {quantityValue()}
                                                    </td>
                                                    <td class="py-5 px-4  border-r border-zinc-200 text-right text-sm text-black">
                                                        {transaction.unit ?? ''}
                                                    </td>
                                                    <td class="py-5 pr-8 border-r border-zinc-200  text-right">
                                                        <form action={deleteTransaction} method="post">
                                                            <input type="hidden" name="id" value={transaction.id} />
                                                            <input type="hidden" name="dest" value={params.id} />
                                                            <input type="hidden" name="entity" value={entityFilter()} />
                                                            <button
                                                                type="submit"
                                                                class="text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg px-3 py-1.5 transition-colors"
                                                                onClick={(event) => {
                                                                    if (
                                                                        !window.confirm(
                                                                            'Delete this transaction? This cannot be undone.',
                                                                        )
                                                                    ) {
                                                                        event.preventDefault();
                                                                    }
                                                                }}
                                                            >
                                                                Delete
                                                            </button>
                                                        </form>
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
        <td colspan={6} class="py-16 text-center">
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
                    <div class="h-4 w-24 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-16 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-40 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-4 w-36 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 px-4 text-right">
                    <div class="h-4 w-12 bg-zinc-200 rounded inline-block"></div>
                </td>
                <td class="py-5 pr-8 text-right">
                    <div class="h-4 w-16 bg-zinc-200 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
