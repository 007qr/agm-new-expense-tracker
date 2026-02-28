import { action, createAsync, query, redirect, useLocation, useParams } from '@solidjs/router';
import { and, desc, eq, getViewSelectedFields, sql, gte, lte } from 'drizzle-orm';
import { createSignal, createEffect, onCleanup, onMount, For, Show, Suspense, useTransition } from 'solid-js';
import DateRangePicker from '~/components/DateRangePicker';
import Sheet from '~/components/Sheet';
import { FormContent } from '~/routes/expenses/new/index';
import { EditFormContent } from '~/routes/expenses/edit/[id]';
import { db } from '~/drizzle/client';
import { Transaction, TransactionDetail } from '~/drizzle/schema';
import { Pagination } from '~/components/Pagination';
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
        const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
        const dateFilter =
            filter === '7days'  ? gte(TransactionDetail.created_at, daysAgo(7)) :
            filter === '30days' ? gte(TransactionDetail.created_at, daysAgo(30)) :
            filter === 'custom' && dateRange ? and(
                gte(TransactionDetail.created_at, new Date(dateRange.from + 'T00:00:00')),
                lte(TransactionDetail.created_at, new Date(dateRange.to + 'T23:59:59')),
            ) : undefined;

        const results = await db
            .select({
                ...getViewSelectedFields(TransactionDetail),
                total_count: sql<number>`COUNT(*) OVER()`.as('total_count'),
            })
            .from(TransactionDetail)
            .where(and(
                eq(TransactionDetail.source_id, dest),
                entity?.trim() ? eq(TransactionDetail.entity_id, entity.trim()) : undefined,
                dateFilter,
            ))
            .orderBy(desc(TransactionDetail.created_at))
            .limit(limit)
            .offset(offset);
        return {
            transactions: results,
            destination: results[0]?.source_name ?? 'Unknown',
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
    const [sheetOpen, setSheetOpen] = createSignal(false);
    const [editingId, setEditingId] = createSignal<string | null>(null);
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
    const [showTotal, setShowTotal] = createSignal(false);

    // Ctrl+A → open New Expense sheet
    onMount(() => {
        const handler = (e: KeyboardEvent) => {
            if (
                e.ctrlKey &&
                e.code === 'KeyA' &&
                !(e.target instanceof HTMLInputElement) &&
                !(e.target instanceof HTMLTextAreaElement) &&
                !(e.target instanceof HTMLSelectElement) &&
                !(e.target as HTMLElement).isContentEditable
            ) {
                e.preventDefault();
                setSheetOpen(true);
            }
        };
        document.addEventListener('keydown', handler);
        onCleanup(() => document.removeEventListener('keydown', handler));
    });

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
                    <ExportPanel destinationId={params.id} />
                    <button
                        onClick={() => setSheetOpen(true)}
                        class="px-4 py-2 bg-black hover:bg-black/80 text-white font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                        title="New Expense (Ctrl+A)"
                    >
                        + New Expense
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div class="mb-6 bg-white border border-zinc-200 rounded-lg p-4 shadow-sm">
                <div class="flex items-center justify-between gap-4 flex-wrap">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-medium text-zinc-700">Filter by:</span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    startTransition(() => {
                                        setActiveFilter('all');
                                        setDateRange(null);
                                    });
                                }}
                                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
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
                                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                                classList={{
                                    'bg-blue-600 text-white shadow-sm': activeFilter() === '7days',
                                    'bg-zinc-100 text-zinc-700 hover:bg-zinc-200': activeFilter() !== '7days',
                                }}
                            >
                                Last 7d
                            </button>
                            <button
                                onClick={() => {
                                    startTransition(() => {
                                        setActiveFilter('30days');
                                        setDateRange(null);
                                    });
                                }}
                                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                                classList={{
                                    'bg-blue-600 text-white shadow-sm': activeFilter() === '30days',
                                    'bg-zinc-100 text-zinc-700 hover:bg-zinc-200': activeFilter() !== '30days',
                                }}
                            >
                                Last 30d
                            </button>
                            <div class="h-5 w-px bg-zinc-300 mx-0.5"></div>
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
                    <Show when={totalCount() > 0}>
                        <Pagination
                            compact
                            page={page()}
                            pageSize={pageSize()}
                            totalCount={totalCount()}
                            onPageChange={setPage}
                            onPageSizeChange={(p) => { setPageSize(p); setPage(1); }}
                        />
                    </Show>
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
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
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
                                            const isCredit = tx.type === 'credit';
                                            return (
                                                <tr class="group hover:bg-zinc-50/80">
                                                    <td class="py-3 px-3 text-sm text-zinc-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-zinc-50/80 z-10">
                                                        {new Date(tx.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm whitespace-nowrap">
                                                        <span
                                                            class="px-2 py-0.5 text-xs font-semibold rounded-full"
                                                            classList={{
                                                                'bg-green-100 text-green-700': isCredit,
                                                                'bg-orange-100 text-orange-700': !isCredit,
                                                            }}
                                                        >
                                                            {isCredit ? 'Credit' : 'Debit'}
                                                        </span>
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-black font-medium whitespace-nowrap">
                                                        {tx.entity_name}
                                                    </td>
                                                    <td class="py-3 px-3 text-sm text-zinc-600 whitespace-nowrap">
                                                        {tx.entity_variant || '--'}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-zinc-700 whitespace-nowrap tabular-nums">
                                                        {Number(tx.rate).toFixed(2)}
                                                    </td>
                                                    <td class="py-3 px-3 text-right text-sm text-zinc-700 whitespace-nowrap tabular-nums">
                                                        {Number(tx.quantity).toFixed(2)} {tx.entity_unit}
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
                                                            <button
                                                                onClick={() => setEditingId(tx.id)}
                                                                class="text-xs font-semibold text-blue-500 hover:text-blue-700"
                                                            >
                                                                Edit
                                                            </button>
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
            </div>

            {/* New Expense Sheet */}
            <Sheet open={sheetOpen()} onClose={() => setSheetOpen(false)} title="New Expense">
                <Show when={sheetOpen()}>
                    <Suspense fallback={<SheetSkeleton />}>
                        <FormContent
                            defaultSourceId={params.id}
                            noRedirect={true}
                            hideSource={true}
                            autoFocus={true}
                            onSuccess={() => {
                                setSheetOpen(false);
                                setShowTotal(false);
                            }}
                        />
                    </Suspense>
                </Show>
            </Sheet>

            {/* Edit Expense Sheet */}
            <Sheet open={editingId() !== null} onClose={() => setEditingId(null)} title="Edit Expense">
                <Show when={editingId()}>
                    {(id) => (
                        <Suspense fallback={<SheetSkeleton />}>
                            <EditFormContent
                                transactionId={id()}
                                noRedirect={true}
                                onSuccess={() => {
                                    setEditingId(null);
                                    setShowTotal(false);
                                }}
                            />
                        </Suspense>
                    )}
                </Show>
            </Sheet>
        </div>
    );
}

const SheetSkeleton = () => (
    <div class="space-y-6 animate-pulse">
        <div class="space-y-3">
            <div class="h-3 w-16 bg-zinc-200 rounded" />
            <div class="grid grid-cols-2 gap-3">
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
            </div>
        </div>
        <div class="h-px bg-zinc-200" />
        <div class="space-y-3">
            <div class="h-3 w-24 bg-zinc-200 rounded" />
            <div class="grid grid-cols-2 gap-3">
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
            </div>
            <div class="grid grid-cols-3 gap-3">
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
                <div class="h-[66px] bg-zinc-200 rounded-xl" />
            </div>
        </div>
        <div class="h-[54px] bg-zinc-200 rounded-xl" />
    </div>
);

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

// ── ExportPanel ────────────────────────────────────────────────────

type ExportPanelProps = { destinationId: string };

function ExportPanel(props: ExportPanelProps) {
    const [open, setOpen]               = createSignal(false);
    const [fromDate, setFromDate]       = createSignal('');
    const [toDate, setToDate]           = createSignal('');
    const [dlLoading, setDlLoading]     = createSignal(false);
    const [wkLoading, setWkLoading]     = createSignal(false);
    const [error, setError]             = createSignal('');
    let containerRef!: HTMLDivElement;

    createEffect(() => {
        if (!open()) return;
        const handler = (e: MouseEvent) => {
            if (!containerRef?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        onCleanup(() => document.removeEventListener('mousedown', handler));
    });

    const datesValid = () => !!fromDate() && !!toDate() && fromDate() <= toDate();

    const triggerDownload = async (url: string, filename: string, setLoading: (v: boolean) => void) => {
        setError('');
        setLoading(true);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            setOpen(false);
        } catch {
            setError('Export failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        const url = `/api/expenses/${props.destinationId}/export?format=simple&from=${fromDate()}&to=${toDate()}`;
        triggerDownload(url, `expenses-${fromDate()}-to-${toDate()}.csv`, setDlLoading);
    };

    const handleWeekly = () => {
        const url = `/api/expenses/${props.destinationId}/export?format=weekly&from=${fromDate()}&to=${toDate()}`;
        triggerDownload(url, `weekly-report-${fromDate()}-to-${toDate()}.csv`, setWkLoading);
    };

    return (
        <div ref={containerRef} class="relative">
            {/* Trigger */}
            <button
                onClick={() => { setOpen(!open()); setError(''); }}
                class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
                <svg viewBox="0 0 20 20" fill="currentColor" class={`h-3 w-3 transition-transform duration-150 ${open() ? 'rotate-180' : ''}`}>
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
            </button>

            {/* Popover */}
            <Show when={open()}>
                <div class="absolute right-0 top-full mt-2 w-80 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    <div class="flex items-center justify-between px-4 pt-4 pb-3">
                        <span class="text-sm font-semibold text-black">Select Date Range</span>
                        <button
                            onClick={() => setOpen(false)}
                            class="text-zinc-400 hover:text-black rounded p-0.5 transition-colors"
                            aria-label="Close"
                        >
                            <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                        </button>
                    </div>

                    <div class="px-4 pb-4 grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs font-medium text-zinc-500 mb-1 block">From</label>
                            <input
                                type="date"
                                value={fromDate()}
                                max={toDate() || undefined}
                                onInput={(e) => setFromDate(e.currentTarget.value)}
                                class="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm text-black focus:outline-none focus:border-zinc-400 transition-colors"
                            />
                        </div>
                        <div>
                            <label class="text-xs font-medium text-zinc-500 mb-1 block">To</label>
                            <input
                                type="date"
                                value={toDate()}
                                min={fromDate() || undefined}
                                onInput={(e) => setToDate(e.currentTarget.value)}
                                class="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-sm text-black focus:outline-none focus:border-zinc-400 transition-colors"
                            />
                        </div>
                    </div>

                    <Show when={error()}>
                        <p class="mx-4 mb-3 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error()}</p>
                    </Show>

                    <div class="border-t border-zinc-100 bg-zinc-50 px-4 py-3 flex gap-2">
                        <button
                            onClick={handleWeekly}
                            disabled={!datesValid() || wkLoading() || dlLoading()}
                            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                            title="Pending transactions only"
                        >
                            <Show
                                when={wkLoading()}
                                fallback={
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                }
                            >
                                <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </Show>
                            {wkLoading() ? 'Generating...' : 'Weekly Report'}
                        </button>

                        <button
                            onClick={handleDownload}
                            disabled={!datesValid() || dlLoading() || wkLoading()}
                            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                            title="All transactions"
                        >
                            <Show
                                when={dlLoading()}
                                fallback={
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                }
                            >
                                <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </Show>
                            {dlLoading() ? 'Downloading...' : 'Download'}
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
}

// ── TotalAmountDisplay ─────────────────────────────────────────────

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
