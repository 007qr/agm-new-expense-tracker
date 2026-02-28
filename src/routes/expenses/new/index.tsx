import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { action, createAsync, query, redirect, useSubmission } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Entity, Destination, PaymentStatus, TransportationCost, Transaction, EntityVariant } from '~/drizzle/schema';
import { createId } from '@paralleldrive/cuid2';
import { SelectInput, TextInput } from '~/components/form';
import { VirtualizedCombobox } from '~/components/VirtualizedCombobox';
import { requireAuth } from '~/lib/require-auth';

// --- QUERIES & ACTIONS ---

export const loadFormData = query(async () => {
    'use server';
    const [entities, destinations, variants] = await Promise.all([
        db.select({ id: Entity.id, name: Entity.name, unit: Entity.unit }).from(Entity),
        db.select({ id: Destination.id, name: Destination.name }).from(Destination),
        db.select().from(EntityVariant),
    ]);
    return { entities, destinations, variants };
}, 'expense-form-data');

// Client-side singleton — not in the router's query cache, so it is never
// revalidated after actions. Reference data (entities, destinations, variants)
// rarely changes, making this safe for the lifetime of a page session.
let _formDataCache: ReturnType<typeof loadFormData> | null = null;
export function getFormData() {
    if (typeof window === 'undefined') return loadFormData(); // SSR: always fresh
    if (!_formDataCache) _formDataCache = loadFormData();
    return _formDataCache;
}

export const createExpense = action(async (formData: FormData) => {
    'use server';
    await requireAuth(['expense-user']);

    const getStringField = (key: string) => (formData.get(key) as string)?.trim() ?? '';
    const getNumericField = (key: string) => {
        const val = (formData.get(key) as string)?.trim();
        return val ? Number.parseFloat(val) : null;
    };
    const getBooleanField = (key: string) => formData.get(key) === 'on';

    const entityId = getStringField('entity_id');
    const entityVariantId = getStringField('entity_variant_id');
    const quantity = getNumericField('quantity');
    const rate = getNumericField('rate');
    const paymentStatus = getStringField('payment_status') as (typeof PaymentStatus)[number];
    const sourceId = getStringField('source_id');
    const transactionType = getStringField('transaction_type') as 'credit' | 'debit';
    const dateStr = getStringField('date');
    const addTransportationCost = getBooleanField('add_transportation_cost');

    if (!entityId || !paymentStatus || !sourceId) return { error: 'Missing required fields.' };
    if (transactionType !== 'credit' && transactionType !== 'debit') return { error: 'Invalid transaction type.' };
    if (quantity === null || quantity <= 0) return { error: 'Quantity must be a positive number.' };
    if (rate === null || rate < 0) return { error: 'Rate must be a positive number or zero.' };

    const amount = quantity * rate;

    try {
        let transportationCostId: string | undefined = undefined;

        if (addTransportationCost) {
            const vehicleType = getStringField('vehicle_type');
            const regNo = getStringField('reg_no');
            const transportationCostAmount = getNumericField('transportation_cost');

            // Only create a transportation cost record if a valid cost is provided
            if (transportationCostAmount !== null && transportationCostAmount > 0) {
                 const [tc] = await db
                    .insert(TransportationCost)
                    .values({
                        id: 'tc_' + createId(),
                        entity_id: entityId,
                        vehicle_type: vehicleType, // Can be empty
                        reg_no: regNo,          // Can be empty
                        cost: String(transportationCostAmount),
                    })
                    .returning({ id: TransportationCost.id });
                transportationCostId = tc.id;
            }
        }

        await db.insert(Transaction).values({
            id: 'tran_' + createId(),
            entity_id: entityId,
            entity_variant_id: entityVariantId || null,
            source_id: sourceId,
            payment_status: paymentStatus,
            transportation_cost_id: transportationCostId, // Will be undefined if not created
            quantity: String(quantity),
            type: transactionType,
            rate: String(rate),
            amount: String(amount),
            ...(dateStr ? { created_at: new Date(dateStr) } : {}),
        });

        const noRedirect = formData.get('no_redirect') === 'true';
        if (noRedirect) {
            return { success: true };
        }
        throw redirect(`/expenses`);
    } catch (error: unknown) {
        if (error instanceof Response) throw error;
        console.error(error);
        return { error: 'Failed to create expense.' };
    }
});

// --- FORM CONTENT ---

type FormContentProps = {
    defaultSourceId?: string;
    noRedirect?: boolean;
    onSuccess?: () => void;
    autoFocus?: boolean;
    hideSource?: boolean;
};

export function FormContent(props: FormContentProps) {
    const data = createAsync(() => getFormData());
    const submission = useSubmission(createExpense);

    let prevResult = submission.result;
    createEffect(() => {
        const result = submission.result as any;
        if (result !== prevResult && result?.success === true) {
            prevResult = result;
            props.onSuccess?.();
        }
    });

    let formRef!: HTMLFormElement;
    onMount(() => {
        if (props.autoFocus) {
            setTimeout(() => {
                const el = formRef?.querySelector('input:not([type=hidden]):not([readonly])') as HTMLInputElement | null;
                el?.focus();
            }, 80);
        }
    });

    const entities = () => data()?.entities ?? [];
    const destinations = () => data()?.destinations ?? [];
    const variants = () => data()?.variants ?? [];

    const [selectedEntityId, setSelectedEntityId] = createSignal('');
    const availableVariants = createMemo(() => variants().filter((v) => v.entity_id === selectedEntityId()));

    const [quantity, setQuantity] = createSignal(0);
    const [rate, setRate] = createSignal(0);
    const amount = createMemo(() => (quantity() * rate()).toFixed(2));

    const today = () => new Date().toISOString().split('T')[0];

    const LS_DATE_KEY = 'expense-form-date';
    const [date, setDate] = createSignal(today());
    onMount(() => {
        const stored = localStorage.getItem(LS_DATE_KEY);
        if (stored) setDate(stored);
    });

    const handleDateChange = (e: Event) => {
        const val = (e.currentTarget as HTMLInputElement).value;
        setDate(val);
        localStorage.setItem(LS_DATE_KEY, val);
    };

    const [transactionType, setTransactionType] = createSignal('credit');

    const [addTransportation, setAddTransportation] = createSignal(false);
    const [vehicleType, setVehicleType] = createSignal('');
    const [regNo, setRegNo] = createSignal('');
    const [transportationCost, setTransportationCost] = createSignal('');

    return (
        <div class="space-y-8">
            <form ref={formRef} action={createExpense} method="post" class="space-y-8">
                <Show when={props.noRedirect}>
                    <input type="hidden" name="no_redirect" value="true" />
                </Show>
                {/* Source: full section or hidden input depending on hideSource */}
                <Show
                    when={!props.hideSource}
                    fallback={<input type="hidden" name="source_id" value={props.defaultSourceId} />}
                >
                    <div class="space-y-5">
                        <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Source</h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <VirtualizedCombobox
                                name="source_id"
                                label="Paid From (Source)"
                                placeholder="Search source..."
                                required
                                options={destinations()}
                                defaultValue={props.defaultSourceId}
                            />
                            <TransactionTypeToggle value={transactionType()} onChange={setTransactionType} />
                        </div>
                    </div>
                    <div class="w-full h-px bg-zinc-200 border-t border-dashed" />
                </Show>

                {/* Transaction Type shown standalone when source is hidden */}
                <Show when={props.hideSource}>
                    <TransactionTypeToggle value={transactionType()} onChange={setTransactionType} />
                </Show>

                {/* Section 1: Main Details */}
                <div class="space-y-5">
                    <Show when={!props.hideSource}>
                        <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Expense Details</h2>
                    </Show>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <VirtualizedCombobox
                            name="entity_id"
                            label="Expense For (Entity)"
                            placeholder="Search item..."
                            required
                            options={entities()}
                            onValueChange={setSelectedEntityId}
                        />

                        <div
                            class={`transition-opacity duration-300 ${!selectedEntityId() ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                        >
                            <SelectInput name="entity_variant_id" label="Variant (Optional)">
                                <option value="" selected>
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

                                        return <option value={v.id}>{label || 'Standard'}</option>;
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
                            onInput={(e) => setQuantity(parseFloat(e.currentTarget.value) || 0)}
                            required
                        />
                        <TextInput
                            name="rate"
                            label="Rate (₹)"
                            type="number"
                            step="0.01"
                            value={rate()}
                            onInput={(e) => setRate(parseFloat(e.currentTarget.value) || 0)}
                            required
                        />
                        <TextInput name="amount" label="Total Amount (₹)" value={amount()} type="number" readOnly />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextInput name="date" label="Date" type="date" value={date()} onInput={handleDateChange} required />
                        <SelectInput name="payment_status" label="Payment Status" required>
                            <option value="" disabled selected>
                                Select status...
                            </option>
                            <For each={PaymentStatus}>
                                {(status) => (
                                    <option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                                )}
                            </For>
                        </SelectInput>
                    </div>
                </div>

                <Show when={!props.hideSource}>
                    <div class="w-full h-px bg-zinc-200 border-t border-dashed" />
                </Show>

                {/* Section 2: Transportation */}
                <div class="space-y-5">
                    <div class="flex items-center gap-4">
                        <input
                            type="checkbox"
                            id="add_transportation"
                            name="add_transportation_cost"
                            checked={addTransportation()}
                            onChange={(e) => setAddTransportation(e.currentTarget.checked)}
                            class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black/50"
                        />
                        <label for="add_transportation" class="text-sm font-medium text-black">
                            Add Transportation Cost
                        </label>
                    </div>

                    <Show when={addTransportation()}>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <TextInput
                                name="vehicle_type"
                                label="Vehicle Type"
                                placeholder="e.g. Truck"
                                value={vehicleType()}
                                onInput={(e) => setVehicleType(e.currentTarget.value)}
                            />
                            <TextInput
                                name="reg_no"
                                label="Vehicle Reg. No."
                                placeholder="e.g. MH 12 AB 1234"
                                value={regNo()}
                                onInput={(e) => setRegNo(e.currentTarget.value)}
                            />
                            <TextInput
                                name="transportation_cost"
                                label="Cost (₹)"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={transportationCost()}
                                onInput={(e) => setTransportationCost(e.currentTarget.value)}
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

                {/* Submit Button — sticky at bottom of sheet */}
                <div class="sticky bottom-0 bg-white -mx-5 px-5 pt-4 pb-4 border-t border-zinc-100">
                    <button
                        type="submit"
                        disabled={submission.pending}
                        class="w-full bg-black hover:bg-black/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-4 transition-all"
                    >
                        {submission.pending ? 'Saving...' : 'Save Expense'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// --- REUSABLE UI COMPONENTS ---

function TransactionTypeToggle(props: { value: string; onChange: (v: string) => void }) {
    return (
        <div class="space-y-1.5">
            <input type="hidden" name="transaction_type" value={props.value} />
            <div class="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => props.onChange('credit')}
                    class="flex flex-col items-center justify-center py-3 px-3 rounded-xl border text-sm font-semibold transition-all"
                    classList={{
                        'bg-green-600 border-green-600 text-white shadow-sm': props.value === 'credit',
                        'bg-white border-zinc-200 text-zinc-500 hover:border-green-400 hover:text-green-700 hover:bg-green-50': props.value !== 'credit',
                    }}
                >
                    <span class="text-base leading-none mb-0.5">↓</span>
                    <span>Credit <span class="font-normal opacity-80">(Inward)</span></span>
                </button>
                <button
                    type="button"
                    onClick={() => props.onChange('debit')}
                    class="flex flex-col items-center justify-center py-3 px-3 rounded-xl border text-sm font-semibold transition-all"
                    classList={{
                        'bg-orange-500 border-orange-500 text-white shadow-sm': props.value === 'debit',
                        'bg-white border-zinc-200 text-zinc-500 hover:border-orange-400 hover:text-orange-700 hover:bg-orange-50': props.value !== 'debit',
                    }}
                >
                    <span class="text-base leading-none mb-0.5">↑</span>
                    <span>Debit <span class="font-normal opacity-80">(Outward)</span></span>
                </button>
            </div>
        </div>
    );
}
