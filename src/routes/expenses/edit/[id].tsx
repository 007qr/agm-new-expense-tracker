import { createEffect, createMemo, createSignal, For, Show, Suspense } from 'solid-js';
import { action, createAsync, query, redirect, useParams, useSearchParams, useSubmission } from '@solidjs/router';
import { eq } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Entity, Destination, PaymentStatus, TransportationCost, Transaction, EntityVariant } from '~/drizzle/schema';
import { createId } from '@paralleldrive/cuid2';
import { SelectInput, TextInput } from '~/components/form';
import { VirtualizedCombobox } from '~/components/VirtualizedCombobox';
import { loadFormData } from '../new/index';
import { serializeDateLocal } from '~/utils/dateUtils';
import { requireAuth } from '~/lib/require-auth';

export const loadTransaction = query(async (id: string) => {
    'use server';
    const [rows] = await Promise.all([
        db
            .select({
                id: Transaction.id,
                entity_id: Transaction.entity_id,
                entity_variant_id: Transaction.entity_variant_id,
                source_id: Transaction.source_id,
                type: Transaction.type,
                payment_status: Transaction.payment_status,
                transportation_cost_id: Transaction.transportation_cost_id,
                quantity: Transaction.quantity,
                rate: Transaction.rate,
                amount: Transaction.amount,
                created_at: Transaction.created_at,
                vehicle_type: TransportationCost.vehicle_type,
                reg_no: TransportationCost.reg_no,
                transportation_cost: TransportationCost.cost,
            })
            .from(Transaction)
            .leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
            .where(eq(Transaction.id, id))
            .limit(1),
    ]);
    return rows[0] ?? null;
}, 'load-transaction-for-edit');

export const updateExpense = action(async (formData: FormData) => {
    'use server';
    await requireAuth(['expense-user']);

    const getStringField = (key: string) => (formData.get(key) as string)?.trim() ?? '';
    const getNumericField = (key: string) => {
        const val = (formData.get(key) as string)?.trim();
        return val ? Number.parseFloat(val) : null;
    };
    const getBooleanField = (key: string) => formData.get(key) === 'on';

    const transactionId = getStringField('transaction_id');
    const entityId = getStringField('entity_id');
    const entityVariantId = getStringField('entity_variant_id');
    const quantity = getNumericField('quantity');
    const rate = getNumericField('rate');
    const paymentStatus = getStringField('payment_status') as (typeof PaymentStatus)[number];
    const sourceId = getStringField('source_id');
    const transactionType = getStringField('transaction_type') as 'credit' | 'debit';
    const dateStr = getStringField('date');
    const addTransportationCost = getBooleanField('add_transportation_cost');
    const existingTransportationCostId = getStringField('existing_transportation_cost_id');
    const redirectUrl = getStringField('redirect_url');

    if (!transactionId || !entityId || !paymentStatus || !sourceId)
        return { error: 'Missing required fields.' };
    if (transactionType !== 'credit' && transactionType !== 'debit') return { error: 'Invalid transaction type.' };
    if (quantity === null || quantity <= 0) return { error: 'Quantity must be a positive number.' };
    if (rate === null || rate < 0) return { error: 'Rate must be a positive number or zero.' };

    const amount = quantity * rate;

    try {
        let transportationCostId: string | null = null;

        if (addTransportationCost) {
            const vehicleType = getStringField('vehicle_type');
            const regNo = getStringField('reg_no');
            const transportationCostAmount = getNumericField('transportation_cost');

            if (transportationCostAmount !== null && transportationCostAmount > 0) {
                if (existingTransportationCostId) {
                    await db
                        .update(TransportationCost)
                        .set({
                            entity_id: entityId,
                            vehicle_type: vehicleType,
                            reg_no: regNo,
                            cost: String(transportationCostAmount),
                        })
                        .where(eq(TransportationCost.id, existingTransportationCostId));
                    transportationCostId = existingTransportationCostId;
                } else {
                    const [tc] = await db
                        .insert(TransportationCost)
                        .values({
                            id: 'tc_' + createId(),
                            entity_id: entityId,
                            vehicle_type: vehicleType,
                            reg_no: regNo,
                            cost: String(transportationCostAmount),
                        })
                        .returning({ id: TransportationCost.id });
                    transportationCostId = tc.id;
                }
            }
        } else if (existingTransportationCostId) {
            await db.delete(TransportationCost).where(eq(TransportationCost.id, existingTransportationCostId));
        }

        await db
            .update(Transaction)
            .set({
                entity_id: entityId,
                entity_variant_id: entityVariantId || null,
                source_id: sourceId,
                type: transactionType,
                payment_status: paymentStatus,
                transportation_cost_id: transportationCostId,
                quantity: String(quantity),
                rate: String(rate),
                amount: String(amount),
                ...(dateStr ? { created_at: new Date(dateStr) } : {}),
            })
            .where(eq(Transaction.id, transactionId));

        const noRedirect = formData.get('no_redirect') === 'true';
        if (noRedirect) {
            return { success: true };
        }
        throw redirect(redirectUrl || '/expenses');
    } catch (error: unknown) {
        if (error instanceof Response) throw error;
        console.error(error);
        return { error: 'Failed to update expense.' };
    }
});

// --- EDIT FORM CONTENT ---

type EditFormContentProps = {
    transactionId: string;
    redirectUrl?: string;
    noRedirect?: boolean;
    onSuccess?: () => void;
};

export function EditFormContent(props: EditFormContentProps) {
    const formData = createAsync(() => loadFormData());
    const transaction = createAsync(() => loadTransaction(props.transactionId));
    const submission = useSubmission(updateExpense);

    // Capture the result present at mount so we don't react to a stale success
    // from a previous edit session (the shared useSubmission state persists).
    let prevResult = submission.result;
    createEffect(() => {
        const result = submission.result as any;
        if (result !== prevResult && result?.success === true) {
            prevResult = result;
            props.onSuccess?.();
        }
    });

    let formRef!: HTMLFormElement;

    const entities = () => formData()?.entities ?? [];
    const destinations = () => formData()?.destinations ?? [];
    const variants = () => formData()?.variants ?? [];

    const [selectedEntityId, setSelectedEntityId] = createSignal('');

    const initEntityId = () => {
        const sel = selectedEntityId();
        return sel || transaction()?.entity_id || '';
    };

    const availableVariants = createMemo(() => variants().filter((v) => v.entity_id === initEntityId()));

    const [quantity, setQuantity] = createSignal<number | null>(null);
    const [rate, setRate] = createSignal<number | null>(null);

    const effectiveQuantity = () => quantity() ?? Number(transaction()?.quantity ?? 0);
    const effectiveRate = () => rate() ?? Number(transaction()?.rate ?? 0);
    const amount = createMemo(() => (effectiveQuantity() * effectiveRate()).toFixed(2));

    const txDate = () => {
        const tx = transaction();
        if (!tx) return '';
        return serializeDateLocal(new Date(tx.created_at));
    };

    const hasTransportation = () => !!transaction()?.transportation_cost_id;
    const [addTransportation, setAddTransportation] = createSignal<boolean | null>(null);
    const showTransportation = () => addTransportation() ?? hasTransportation();

    const [vehicleType, setVehicleType] = createSignal<string | null>(null);
    const [regNo, setRegNo] = createSignal<string | null>(null);
    const [transportationCost, setTransportationCost] = createSignal<string | null>(null);

    return (
        <Show when={transaction()} fallback={<div class="text-center py-12 text-zinc-500">Transaction not found.</div>}>
            {(tx) => (
                <div class="space-y-8">
                    <form ref={formRef} action={updateExpense} method="post" class="space-y-8">
                        <input type="hidden" name="transaction_id" value={tx().id} />
                        <input type="hidden" name="existing_transportation_cost_id" value={tx().transportation_cost_id ?? ''} />
                        <Show when={props.noRedirect}>
                            <input type="hidden" name="no_redirect" value="true" />
                        </Show>
                        <Show when={!props.noRedirect && props.redirectUrl}>
                            <input type="hidden" name="redirect_url" value={props.redirectUrl} />
                        </Show>

                        {/* Source */}
                        <div class="space-y-5">
                            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Source</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <VirtualizedCombobox
                                    name="source_id"
                                    label="Paid From (Source)"
                                    placeholder="Search source..."
                                    required
                                    options={destinations()}
                                    defaultValue={tx().source_id ?? ''}
                                />
                                <SelectInput name="transaction_type" label="Transaction Type" required>
                                    <option value="" disabled>Select type...</option>
                                    <option value="debit" selected={tx().type === 'debit'}>Debit</option>
                                    <option value="credit" selected={tx().type === 'credit'}>Credit</option>
                                </SelectInput>
                            </div>
                        </div>

                        <div class="w-full h-px bg-zinc-200 border-t border-dashed" />

                        {/* Expense Details */}
                        <div class="space-y-5">
                            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Expense Details</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <VirtualizedCombobox
                                    name="entity_id"
                                    label="Expense For (Entity)"
                                    placeholder="Search item..."
                                    required
                                    options={entities()}
                                    defaultValue={tx().entity_id ?? ''}
                                    onValueChange={setSelectedEntityId}
                                />

                                <div
                                    class={`transition-opacity duration-300 ${!initEntityId() ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                                >
                                    <SelectInput name="entity_variant_id" label="Variant (Optional)">
                                        <option value="" selected={!tx().entity_variant_id}>
                                            Default / No Variant
                                        </option>
                                        <For each={availableVariants()}>
                                            {(v) => {
                                                const formatNumber = (value: string | null) => {
                                                    if (!value) return null;
                                                    const num = Number.parseFloat(value);
                                                    if (!Number.isFinite(num)) return value;
                                                    return num.toFixed(3).replace(/\.?0+$/, '');
                                                };

                                                const dimensionParts = [v.length, v.width, v.height]
                                                    .map(formatNumber)
                                                    .filter((part) => part);
                                                const dimensionLabel = dimensionParts.length
                                                    ? `${dimensionParts.join('x')} ${v.dimension_unit ?? ''}`.trim()
                                                    : '';
                                                const thicknessValue = formatNumber(v.thickness);
                                                const thicknessLabel = thicknessValue
                                                    ? `Thickness: ${thicknessValue} ${v.thickness_unit ?? ''}`.trim()
                                                    : '';
                                                const label = [dimensionLabel, thicknessLabel].filter(Boolean).join(' · ');

                                                return (
                                                    <option value={v.id} selected={v.id === tx().entity_variant_id}>
                                                        {label || 'Standard'}
                                                    </option>
                                                );
                                            }}
                                        </For>
                                    </SelectInput>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <TextInput
                                    name="quantity"
                                    label="Quantity"
                                    type="number"
                                    step="0.01"
                                    value={effectiveQuantity()}
                                    onInput={(e) => setQuantity(parseFloat((e.currentTarget as HTMLInputElement).value) || 0)}
                                    required
                                />
                                <TextInput
                                    name="rate"
                                    label="Rate (₹)"
                                    type="number"
                                    step="0.01"
                                    value={effectiveRate()}
                                    onInput={(e) => setRate(parseFloat((e.currentTarget as HTMLInputElement).value) || 0)}
                                    required
                                />
                                <TextInput name="amount" label="Total Amount (₹)" value={amount()} type="number" readOnly />
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextInput name="date" label="Date" type="date" value={txDate()} required />
                                <SelectInput name="payment_status" label="Payment Status" required>
                                    <option value="" disabled>
                                        Select status...
                                    </option>
                                    <For each={PaymentStatus}>
                                        {(status) => (
                                            <option value={status} selected={status === tx().payment_status}>
                                                {status.charAt(0).toUpperCase() + status.slice(1)}
                                            </option>
                                        )}
                                    </For>
                                </SelectInput>
                            </div>
                        </div>

                        <div class="w-full h-px bg-zinc-200 border-t border-dashed" />

                        {/* Transportation */}
                        <div class="space-y-5">
                            <div class="flex items-center gap-4">
                                <input
                                    type="checkbox"
                                    id="add_transportation"
                                    name="add_transportation_cost"
                                    checked={showTransportation()}
                                    onChange={(e) => setAddTransportation(e.currentTarget.checked)}
                                    class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black/50"
                                />
                                <label for="add_transportation" class="text-sm font-medium text-black">
                                    Add Transportation Cost
                                </label>
                            </div>

                            <Show when={showTransportation()}>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <TextInput
                                        name="vehicle_type"
                                        label="Vehicle Type"
                                        placeholder="e.g. Truck"
                                        value={vehicleType() ?? tx().vehicle_type ?? ''}
                                        onInput={(e) => setVehicleType((e.currentTarget as HTMLInputElement).value)}
                                    />
                                    <TextInput
                                        name="reg_no"
                                        label="Vehicle Reg. No."
                                        placeholder="e.g. MH 12 AB 1234"
                                        value={regNo() ?? tx().reg_no ?? ''}
                                        onInput={(e) => setRegNo((e.currentTarget as HTMLInputElement).value)}
                                    />
                                    <TextInput
                                        name="transportation_cost"
                                        label="Cost (₹)"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={transportationCost() ?? tx().transportation_cost ?? ''}
                                        onInput={(e) => setTransportationCost((e.currentTarget as HTMLInputElement).value)}
                                    />
                                </div>
                            </Show>
                        </div>

                        {/* Submission Error */}
                        <Show when={submission.result?.error}>
                            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 font-medium">
                                {submission.result?.error}
                            </div>
                        </Show>

                        {/* Submit Button */}
                        <div class="pt-4">
                            <button
                                type="submit"
                                disabled={submission.pending}
                                class="w-full bg-black hover:bg-black/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-4 transition-all"
                            >
                                {submission.pending ? 'Updating...' : 'Update Expense'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </Show>
    );
}

// --- STANDALONE PAGE (kept for direct URL access) ---

export default function EditExpensePage() {
    const params = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();

    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-[85vh] font-sans text-black">
            <div class="w-full max-w-4xl animate-in fade-in zoom-in-95 duration-500">
                <Suspense fallback={<FormSkeleton />}>
                    <EditFormContent
                        transactionId={params.id}
                        redirectUrl={searchParams.redirect ?? ''}
                    />
                </Suspense>
            </div>
        </div>
    );
}

function FormSkeleton() {
    return (
        <div class="space-y-8 animate-pulse">
            <div class="h-8 w-48 bg-zinc-200 rounded-md" />
            <div class="space-y-4">
                <div class="h-3 w-24 bg-zinc-200 rounded" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="h-[66px] bg-zinc-200 rounded-xl" />
                    <div class="h-[66px] bg-zinc-200 rounded-xl" />
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="h-[66px] bg-zinc-200 rounded-xl" />
                    <div class="h-[66px] bg-zinc-200 rounded-xl" />
                    <div class="h-[66px] bg-zinc-200 rounded-xl" />
                </div>
            </div>
            <div class="pt-4">
                <div class="h-[54px] bg-zinc-200 rounded-xl" />
            </div>
        </div>
    );
}
