import { action, createAsync, query, redirect, useLocation, useParams, useSubmission } from '@solidjs/router';
import { and, desc, eq, or, sql, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createSignal, For, Show, Suspense, createResource, useTransition } from 'solid-js';
import DateRangePicker from '~/components/DateRangePicker';
import { db } from '~/drizzle/client';
import { Destination, Entity, Transaction, TransportationCost, EntityVariant } from '~/drizzle/schema';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';
import Breadcrumb from '~/components/Breadcrumb';
import { loadTotalAmount } from './totalAmount';
import { serializeDateLocal } from '~/utils/dateUtils';
import { requireAuth } from '~/lib/require-auth';

export const loadTransactions = query(
    async (
        dest: string,
        entity: string,
        limit: number,
        offset: number,
        filter: string,
        dateRange: { from: string; to: string } | null,
    ) => {
        'use server';
        const entityFilter = entity?.trim();
        let dateFilter;
        // Use Date objects instead of SQL strings for better query planning
        if (filter === '7days') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            dateFilter = gte(Transaction.created_at, sevenDaysAgo);
        } else if (filter === '30days') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateFilter = gte(Transaction.created_at, thirtyDaysAgo);
        } else if (filter === 'custom' && dateRange) {
            dateFilter = and(
                gte(Transaction.created_at, new Date(dateRange.from + 'T00:00:00')),
                lte(Transaction.created_at, new Date(dateRange.to + 'T23:59:59')),
            );
        }
        const baseFilter = or(eq(Transaction.destination_id, dest), eq(Transaction.source_id, dest));
        const filters = and(
            baseFilter,
            entityFilter ? eq(Transaction.entity_id, entityFilter) : undefined,
            dateFilter,
        );
        const evAlias = alias(EntityVariant, 'ev');
        const sourceAlias = alias(Destination, 'source');
        const destinationAlias = alias(Destination, 'destination');
        const currentDestAlias = alias(Destination, 'current_dest');
        // Robust variant formatting SQL based on warehouse query pattern
        const variantDetails = sql<string>`
            NULLIF(
                TRIM(
                    COALESCE(
                        NULLIF(CONCAT_WS(' x ',
                            (CASE WHEN ${evAlias.length} IS NOT NULL AND ${evAlias.length}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.length}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END),
                            (CASE WHEN ${evAlias.width} IS NOT NULL AND ${evAlias.width}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.width}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END),
                            (CASE WHEN ${evAlias.height} IS NOT NULL AND ${evAlias.height}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.height}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END)
                        ), ''),
                        ''
                    )
                    ||
                    (CASE
                        WHEN
                            NULLIF(CONCAT_WS(' x ',
                                (CASE WHEN ${evAlias.length} IS NOT NULL AND ${evAlias.length}::numeric > 0 THEN 'L' END),
                                (CASE WHEN ${evAlias.width} IS NOT NULL AND ${evAlias.width}::numeric > 0 THEN 'W' END),
                                (CASE WHEN ${evAlias.height} IS NOT NULL AND ${evAlias.height}::numeric > 0 THEN 'H' END)
                            ), '') IS NOT NULL
                            AND
                            (${evAlias.thickness} IS NOT NULL AND ${evAlias.thickness}::numeric > 0)
                        THEN ' thickness '
                        ELSE ''
                    END)
                    ||
                    COALESCE(
                        NULLIF(
                            (CASE WHEN ${evAlias.thickness} IS NOT NULL AND ${evAlias.thickness}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.thickness}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.thickness_unit}, '')) ELSE NULL END),
                        ''),
                        ''
                    )
                ),
            '')
        `;
        // Single query with window function for total count
        const results = await db
            .select({
                id: Transaction.id,
                created_at: Transaction.created_at,
                type: Transaction.type,
                quantity: Transaction.quantity,
                rate: Transaction.rate,
                amount: Transaction.amount,
                payment_status: Transaction.payment_status,
                entity_name: Entity.name,
                unit: Entity.unit,
                entity_variant: variantDetails,
                source_name: sourceAlias.name,
                destination_name: destinationAlias.name,
                source_id: Transaction.source_id,
                destination_id: Transaction.destination_id,
                vehicle_type: TransportationCost.vehicle_type,
                reg_no: TransportationCost.reg_no,
                transportation_cost: TransportationCost.cost,
                destination_display: currentDestAlias.name,
                total_count: sql<number>`COUNT(*) OVER()`.as('total_count'),
            })
            .from(Transaction)
            .leftJoin(Entity, eq(Transaction.entity_id, Entity.id))
            .leftJoin(evAlias, eq(Transaction.entity_variant_id, evAlias.id))
            .leftJoin(sourceAlias, eq(Transaction.source_id, sourceAlias.id))
            .leftJoin(destinationAlias, eq(Transaction.destination_id, destinationAlias.id))
            .leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
            .leftJoin(currentDestAlias, eq(currentDestAlias.id, dest))
            .where(filters)
            .orderBy(desc(Transaction.created_at))
            .limit(limit)
            .offset(offset);
        return {
            transactions: results,
            destination: results[0]?.destination_display ?? 'Unknown',
            totalCount: results[0]?.total_count ?? 0,
        };
    },
    'expense-transactions-by-destination',
);

export const deleteTransaction = action(async (formData: FormData) => {
    'use server';
    await requireAuth(['expense-user']);
    const id = formData.get('id') as string;
    await db.delete(Transaction).where(eq(Transaction.id, id));
    return redirect(formData.get('redirectUrl') as string, 302);
});

export default function ExpenseLedgerPage() {
    const params = useParams<{ id: string }>();
    const location = useLocation();
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);
    const entityFilter = () => new URLSearchParams(location.search).get('entity') ?? '';
    const [activeFilter, setActiveFilter] = createSignal('all');
    const [dateRange, setDateRange] = createSignal<{ from: Date; to: Date } | null>(null);
    const [isPending, startTransition] = useTransition();
    const serializedDateRange = () => {
        const range = dateRange();
        return range
            ? { from: serializeDateLocal(range.from), to: serializeDateLocal(range.to) }
            : null;
    };
    const data = createAsync(() =>
        loadTransactions(
            params.id,
            entityFilter(),
            pageSize(),
            (page() - 1) * pageSize(),
            activeFilter(),
            serializedDateRange(),
        ),
    );
    const totalCount = () => data()?.totalCount ?? 0;
    const deletion = useSubmission(deleteTransaction);
    const [showTotal, setShowTotal] = createSignal(false);

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-4">
                <Breadcrumb items={[{ label: 'All sites', href: '/sites' }, { label: 'Expense' },{ label: data()?.destination ?? 'Site' }]} />
            </div>
            <div class="mb-8 flex justify-between items-start">
                <div>
                    <h1 class="text-3xl font-bold text-black tracking-tight">Expense Ledger</h1>
                </div>
                <div class="flex gap-4 items-start">
                    <TotalAmountDisplay
                        destinationId={params.id}
                        filter={activeFilter()}
                        dateRange={serializedDateRange()}
                        showTotal={showTotal()}
                        onShowTotal={() => setShowTotal(true)}
                    />
                    <div>
                        <a
                            href={`/api/expenses/${params.id}/export?filter=${activeFilter()}&dateRange=${encodeURIComponent(JSON.stringify(serializedDateRange()))}`}
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                            title="Export filtered expenses to CSV"
                            download
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export CSV
                        </a>
                    </div>
                </div>
            </div>
            {/* Improved Filter UI */}
            <div class="mb-6 bg-white border border-zinc-200 rounded-lg p-4 shadow-sm">
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-sm font-medium text-zinc-700">Filter by:</span>
                    <div class="flex items-center gap-2">
                        <button
                            onClick={() => {
                                startTransition(() => {
                                    setActiveFilter('all');
                                    setDateRange(null);
                                });
                            }}
                            class="px-4 py-2 text-sm font-medium rounded-md transition-colors"
                            classList={{
                                'bg-blue-600 text-white shadow-sm': activeFilter() === 'all',
                                'bg-zinc-100 text-zinc-700 hover:bg-zinc-200': activeFilter() !== 'all',
                            }}
                        >
                            All Time
                        </button>
                        <button
                            onClick={() => {
                                startTransition(() => {
                                    setActiveFilter('7days');
                                    setDateRange(null);
                                });
                            }}
                            class="px-4 py-2 text-sm font-medium rounded-md transition-colors"
                            classList={{
                                'bg-blue-600 text-white shadow-sm': activeFilter() === '7days',
                                'bg-zinc-100 text-zinc-700 hover:bg-zinc-200': activeFilter() !== '7days',
                            }}
                        >
                            Last 7 Days
                        </button>
                        <button
                            onClick={() => {
                                startTransition(() => {
                                    setActiveFilter('30days');
                                    setDateRange(null);
                                });
                            }}
                            class="px-4 py-2 text-sm font-medium rounded-md transition-colors"
                            classList={{
                                'bg-blue-600 text-white shadow-sm': activeFilter() === '30days',
                                'bg-zinc-100 text-zinc-700 hover:bg-zinc-200': activeFilter() !== '30days',
                            }}
                        >
                            Last 30 Days
                        </button>
                        <div class="h-6 w-px bg-zinc-300 mx-1"></div>
                        <DateRangePicker
                            value={dateRange()}
                            onRangeChange={(range) => {
                                if (range) {
                                    startTransition(() => {
                                        setDateRange(range);
                                        setActiveFilter('custom');
                                    });
                                }
                            }}
                        />
                    </div>
                </div>
                <Show when={dateRange()}>
                    <div class="mt-3 pt-3 border-t border-zinc-200">
                        <div class="inline-flex items-center bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium px-3 py-1.5 rounded-md">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>
                                {dateRange()!.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' → '}
                                {dateRange()!.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <button
                                onClick={() => {
                                    startTransition(() => {
                                        setDateRange(null);
                                        setActiveFilter('all');
                                    });
                                }}
                                class="ml-2 hover:bg-blue-100 rounded p-0.5 transition-colors"
                                aria-label="Clear date range"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </Show>
            </div>
            <div class="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl shadow-black/5 transition-opacity" classList={{ 'opacity-50': isPending() }}>
                <div class="overflow-x-auto">
                    <table class="min-w-[1300px] w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-200 bg-zinc-50">
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600 sticky left-0 bg-zinc-50 z-10">Date</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Type</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Item</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Variant</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">From/To</th>
                                <th class="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-600 min-w-[120px]">Rate (₹)</th>
                                <th class="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-600">Quantity</th>
                                <th class="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-600 min-w-[130px]">Amount (₹)</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Payment</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Vehicle</th>
                                <th class="py-3 px-3 text-xs font-bold uppercase tracking-wider text-zinc-600">Reg. No.</th>
                                <th class="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-600 min-w-[130px]">Transport (₹)</th>
                                <th class="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-600 sticky right-0 bg-zinc-50 z-10"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-100">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show when={(data()?.transactions ?? []).length > 0} fallback={<EmptyState />}>
                                    <For each={data()?.transactions ?? []}>
                                        {(tx) => {
                                            const isInward = tx.destination_id === params.id;
                                            return (
                                                <tr class="group hover:bg-zinc-50/80">
                                                    <td class="py-3 px-3 text-sm text-zinc-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-zinc-50/80 z-10">
                                                        {new Date(tx.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm whitespace-nowrap">
                                                        <span
                                                            class="px-2 py-0.5 text-xs font-semibold rounded-full"
                                                            classList={{
                                                                'bg-green-100 text-green-700': isInward,
                                                                'bg-orange-100 text-orange-700': !isInward,
                                                            }}
                                                        >
                                                            {isInward ? 'Inward' : 'Outward'}
                                                        </span>
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-black font-medium whitespace-nowrap">
                                                        {tx.entity_name}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-zinc-600 whitespace-nowrap">
                                                        {tx.entity_variant || '--'}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-zinc-700 whitespace-nowrap">
                                                        {isInward ? tx.source_name : tx.destination_name}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-zinc-700 whitespace-nowrap tabular-nums">
                                                        {Number(tx.rate).toFixed(2)}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-zinc-700 whitespace-nowrap tabular-nums">
                                                        {Number(tx.quantity).toFixed(2)} {tx.unit}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-black font-semibold whitespace-nowrap tabular-nums">
                                                        {Number(tx.amount).toFixed(2)}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm whitespace-nowrap">
                                                        <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                                                            {tx.payment_status}
                                                        </span>
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-zinc-600 whitespace-nowrap">
                                                        {tx.vehicle_type || '--'}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-zinc-600 whitespace-nowrap">
                                                        {tx.reg_no || '--'}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-zinc-700 whitespace-nowrap tabular-nums">
                                                        {tx.transportation_cost
                                                            ? Number(tx.transportation_cost).toFixed(2)
                                                            : '--'}
                                                    </td>
                                                    <td class="py-3 px-3 text-right sticky right-0 bg-white group-hover:bg-zinc-50/80 z-10">
                                                        <div class="flex items-center justify-end gap-3">
                                                            <a
                                                                href={`/expenses/edit/${tx.id}?redirect=${encodeURIComponent(location.pathname + location.search)}`}
                                                                class="text-xs font-semibold text-blue-500 hover:text-blue-700"
                                                            >
                                                                Edit
                                                            </a>
                                                            <form action={deleteTransaction} method="post">
                                                                <input type="hidden" name="id" value={tx.id} />
                                                                <input
                                                                    type="hidden"
                                                                    name="redirectUrl"
                                                                    value={location.pathname + location.search}
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    class="text-xs font-semibold text-red-500 hover:text-red-700"
                                                                    onClick={(e) =>
                                                                        !confirm('Delete transaction?') && e.preventDefault()
                                                                    }
                                                                >
                                                                    Delete
                                                                </button>
                                                            </form>
                                                        </div>
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
                        <div class="p-4">
                            <PaginationSkeleton />
                        </div>
                    }
                >
                    <Show when={totalCount() > 0}>
                        <div class="border-t border-zinc-200 p-4">
                            <Pagination
                                page={page()}
                                pageSize={pageSize()}
                                totalCount={totalCount()}
                                onPageChange={setPage}
                                onPageSizeChange={(p) => {
                                    setPageSize(p);
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
        <td colspan={13} class="text-center py-12 text-sm text-zinc-400">
            No expense transactions found.
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={Array(5)}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-20"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-14"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-28"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-24"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-20"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-16"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-14"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-18"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-16"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-20"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-22"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-16"></div></td>
                <td class="py-3.5 px-3"><div class="h-4 bg-zinc-100 rounded w-12"></div></td>
            </tr>
        )}
    </For>
);

type TotalAmountDisplayProps = {
    destinationId: string;
    filter: string;
    dateRange: { from: string; to: string } | null;
    showTotal: boolean;
    onShowTotal: () => void;
};

function TotalAmountDisplay(props: TotalAmountDisplayProps) {
    const totalAmount = createAsync(() =>
        props.showTotal
            ? loadTotalAmount(props.destinationId, props.filter, props.dateRange)
            : Promise.resolve(null)
    );

    return (
        <div class="text-right">
            <p class="text-sm font-bold text-black">Total Amount</p>
            <Show
                when={props.showTotal}
                fallback={
                    <button
                        onClick={props.onShowTotal}
                        class="text-blue-600 hover:underline text-sm"
                    >
                        Show Total
                    </button>
                }
            >
                <Suspense
                    fallback={
                        <div class="text-2xl font-bold text-black animate-pulse">
                            ₹...
                        </div>
                    }
                >
                    <span class="text-2xl font-bold text-black">
                        ₹{Number(totalAmount() ?? 0).toFixed(2)}
                    </span>
                </Suspense>
            </Show>
        </div>
    );
}
