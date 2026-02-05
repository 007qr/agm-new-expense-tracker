import { action, createAsync, query, redirect, useLocation, useParams, useSubmission } from '@solidjs/router';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createEffect, createSignal, For, Show, Suspense, createResource } from 'solid-js';
import { db } from '~/drizzle/client';
import { Destination, Entity, Transaction, TransportationCost, EntityVariant } from '~/drizzle/schema';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';
import { loadTotalAmount } from './totalAmount';

export const loadTransactions = query(async (dest: string, entity: string, limit: number, offset: number) => {
    'use server';

    const entityFilter = entity?.trim();
    const baseFilter = or(eq(Transaction.destination_id, dest), eq(Transaction.source_id, dest));
    const filters = entityFilter ? and(baseFilter, eq(Transaction.entity_id, entityFilter)) : baseFilter;

    const transactions = await db
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
            source_name: alias(Destination, 'source').name,
            destination_name: alias(Destination, 'destination').name,
            source_id: Transaction.source_id,
            destination_id: Transaction.destination_id,
            vehicle_type: TransportationCost.vehicle_type,
            reg_no: TransportationCost.reg_no,
            transportation_cost: TransportationCost.cost,
        })
        .from(Transaction)
        .leftJoin(Entity, eq(Transaction.entity_id, Entity.id))
        .leftJoin(alias(Destination, 'source'), eq(Transaction.source_id, alias(Destination, 'source').id))
        .leftJoin(alias(Destination, 'destination'), eq(Transaction.destination_id, alias(Destination, 'destination').id))
        .leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
        .where(filters)
        .orderBy(desc(Transaction.created_at))
        .limit(limit)
        .offset(offset);

    const totalCount = await db.select({ total: sql<number>`COUNT(*)` }).from(Transaction).where(filters).then(rows => rows[0].total);
    const destination = await db.select({ name: Destination.name }).from(Destination).where(eq(Destination.id, dest)).then(rows => rows[0]);

    return {
        transactions,
        destination: destination?.name ?? 'Unknown',
        totalCount,
    };
}, 'expense-transactions-by-destination');

export const deleteTransaction = action(async (formData: FormData) => {
    'use server';
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
    const data = createAsync(() => loadTransactions(params.id, entityFilter(), pageSize(), (page() - 1) * pageSize()));
    const totalCount = () => data()?.totalCount ?? 0;
    const deletion = useSubmission(deleteTransaction);

    const [showTotal, setShowTotal] = createSignal(false);
    const [triggerFetch, setTriggerFetch] = createSignal(false);
    const [totalAmount] = createResource(
        () => (triggerFetch() ? { dest: params.id, entity: entityFilter() } : null),
        ({ dest, entity }) => loadTotalAmount(dest, entity)
    );

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex justify-between items-start">
                <div>
                    <h1 class="text-3xl font-bold text-black tracking-tight">Expense Ledger</h1>
                    <p class="text-base text-zinc-600">For site: <span class="font-medium text-zinc-900">{data()?.destination}</span></p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold text-black">Total Amount</p>
                    <Show
                        when={showTotal()}
                        fallback={
                            <button
                                onClick={() => { setShowTotal(true); setTriggerFetch(true); }}
                                class="text-blue-600 hover:underline"
                                disabled={totalAmount.loading}
                            >
                                {totalAmount.loading ? 'Loading...' : 'Show Total'}
                            </button>
                        }
                    >
                        <span class="text-2xl font-bold text-black" classList={{ 'blur-sm': totalAmount.loading }}>
                            ₹{Number(totalAmount() ?? 0).toFixed(2)}
                        </span>
                    </Show>
                </div>
            </div>

            <div class="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl shadow-black/5">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        {/* ... table head remains the same */}
                        <thead>
                            <tr class="border-b border-zinc-200">
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">Date</th>
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">Item</th>
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">From/To</th>
                                <th class="py-5 px-4 text-right text-xs font-bold uppercase tracking-wider text-zinc-800">Rate (₹)</th>
                                <th class="py-5 px-4 text-right text-xs font-bold uppercase tracking-wider text-zinc-800">Quantity</th>
                                <th class="py-5 px-4 text-right text-xs font-bold uppercase tracking-wider text-zinc-800">Amount (₹)</th>
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">Payment</th>
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">Vehicle Type</th>
                                <th class="py-5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-800">Reg. No.</th>
                                <th class="py-5 px-4 text-right text-xs font-bold uppercase tracking-wider text-zinc-800">Transport Cost (₹)</th>
                                <th class="py-5 pr-8 text-right text-xs font-bold uppercase tracking-wider text-zinc-800">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-200">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show when={data()?.transactions.length ?? 0 > 0} fallback={<EmptyState />}>
                                    <For each={data()?.transactions}>
                                        {tx => (
                                            <tr class="group hover:bg-zinc-50">
                                                <td class="py-4 px-4 text-sm text-zinc-700">{new Date(tx.created_at).toLocaleDateString()}</td>
                                                <td class="py-4 px-4 text-sm text-black font-medium">{tx.entity_name}</td>
                                                <td class="py-4 px-4 text-sm text-zinc-700">{tx.source_id === params.id ? tx.destination_name : tx.source_name}</td>
                                                <td class="py-4 px-4 text-right text-sm text-zinc-700">{Number(tx.rate).toFixed(2)}</td>
                                                <td class="py-4 px-4 text-right text-sm text-zinc-700">{tx.quantity} {tx.unit}</td>
                                                <td class="py-4 px-4 text-right text-sm text-black font-medium">{Number(tx.amount).toFixed(2)}</td>
                                                <td class="py-4 px-4 text-sm"><span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{tx.payment_status}</span></td>
                                                <td class="py-4 px-4 text-sm text-zinc-700">{tx.vehicle_type || '--'}</td>
                                                <td class="py-4 px-4 text-sm text-zinc-700">{tx.reg_no || '--'}</td>
                                                <td class="py-4 px-4 text-right text-sm text-zinc-700">{tx.transportation_cost ? Number(tx.transportation_cost).toFixed(2) : '--'}</td>
                                                <td class="py-4 pr-8 text-right">
                                                    <form action={deleteTransaction} method="post">
                                                        <input type="hidden" name="id" value={tx.id} />
                                                        <input type="hidden" name="redirectUrl" value={location.pathname + location.search} />
                                                        <button type="submit" class="text-xs font-semibold text-red-500 hover:text-red-700" onClick={e => !confirm('Delete transaction?') && e.preventDefault()}>Delete</button>
                                                    </form>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </Show>
                            </Suspense>
                        </tbody>
                    </table>
                </div>
                {/* ... pagination remains the same */}
                 <Suspense fallback={<div class="p-4"><PaginationSkeleton /></div>}>
                    <Show when={totalCount() > 0}>
                        <div class="border-t border-zinc-200 p-4">
                            <Pagination page={page()} pageSize={pageSize()} totalCount={totalCount()} onPageChange={setPage} onPageSizeChange={p => { setPageSize(p); setPage(1); }} />
                        </div>
                    </Show>
                </Suspense>
            </div>
        </div>
    );
}

const EmptyState = () => (
    <tr><td colspan={11} class="text-center py-16 text-zinc-500">No expense transactions found.</td></tr>
);

const TableSkeleton = () => (
    <For each={Array(5)}>{() => (
        <tr class="animate-pulse">
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-20"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-32"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-24"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-16"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-16"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-20"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-16"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-24"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-24"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-20"></div></td>
            <td class="py-5 px-4"><div class="h-4 bg-zinc-200 rounded w-16"></div></td>
        </tr>
    )}</For>
);
