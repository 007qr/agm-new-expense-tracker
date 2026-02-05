import { createMemo, createSignal, For, Show, Suspense } from 'solid-js';
import type { JSX } from 'solid-js';
import { action, createAsync, query, redirect, useSubmission } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Entity, Destination, PaymentStatus, TransportationCost, Transaction, EntityVariant } from '~/drizzle/schema';
import { createId } from '@paralleldrive/cuid2';

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

export const createExpense = action(async (formData: FormData) => {
    'use server';

    const getStringField = (key: string) => (formData.get(key) as string)?.trim() ?? '';
    const getNumericField = (key: string) => {
        const val = (formData.get(key) as string)?.trim();
        return val ? Number.parseFloat(val) : null;
    };
    const getBooleanField = (key: string) => formData.get(key) === 'on';

    const destinationId = getStringField('destination_id');
    const entityId = getStringField('entity_id');
    const entityVariantId = getStringField('entity_variant_id');
    const quantity = getNumericField('quantity');
    const rate = getNumericField('rate');
    const amount = getNumericField('amount');
    const paymentStatus = getStringField('payment_status') as (typeof PaymentStatus)[number];
    const sourceId = getStringField('source_id');
    const addTransportationCost = getBooleanField('add_transportation_cost');

    if (!destinationId || !entityId || !paymentStatus || !sourceId) return { error: 'Missing required fields.' };
    if (quantity === null || quantity <= 0) return { error: 'Quantity must be a positive number.' };
    if (rate === null || rate < 0) return { error: 'Rate must be a positive number or zero.' };

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
            destination_id: destinationId,
            source_id: sourceId,
            payment_status: paymentStatus,
            transportation_cost_id: transportationCostId, // Will be undefined if not created
            quantity: String(quantity),
            type: 'debit',
            rate: String(rate),
            amount: String(amount),
        });

        throw redirect(`/expenses`);
    } catch (error: unknown) {
        if (error instanceof Response) throw error;
        console.error(error);
        return { error: 'Failed to create expense.' };
    }
});

// --- MAIN COMPONENT ---

export default function NewExpensePage() {
    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-[85vh] font-sans text-black">
            <div class="w-full max-w-4xl animate-in fade-in zoom-in-95 duration-500">
                <Suspense fallback={<FormSkeleton />}>
                    <FormContent />
                </Suspense>
            </div>
        </div>
    );
}

// --- FORM CONTENT & SKELETON ---

function FormContent() {
    const data = createAsync(() => loadFormData());
    const submission = useSubmission(createExpense);

    const entities = () => data()?.entities ?? [];
    const destinations = () => data()?.destinations ?? [];
    const variants = () => data()?.variants ?? [];

    const [selectedEntityId, setSelectedEntityId] = createSignal('');
    const availableVariants = createMemo(() => variants().filter((v) => v.entity_id === selectedEntityId()));

    const [quantity, setQuantity] = createSignal(0);
    const [rate, setRate] = createSignal(0);
    const amount = createMemo(() => (quantity() * rate()).toFixed(2));

    const [addTransportation, setAddTransportation] = createSignal(false);
    // New signals for transportation fields
    const [vehicleType, setVehicleType] = createSignal('');
    const [regNo, setRegNo] = createSignal('');
    const [transportationCost, setTransportationCost] = createSignal('');

    return (
        <div class="space-y-8">
            <div class="mb-10">
                <h1 class="text-2xl font-semibold text-black">New Expense</h1>
                <p class="text-zinc-600 text-sm mt-1">Record a new expense for this destination.</p>
            </div>

            <form action={createExpense} method="post" class="space-y-8">
                {/* Section for Route */}
                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Route</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectInput name="source_id" label="Paid From (Source)" required>
                            <option value="" disabled selected>
                                Select a source...
                            </option>
                            <For each={destinations()}>{(dest) => <option value={dest.id}>{dest.name}</option>}</For>
                        </SelectInput>
                        <SelectInput name="destination_id" label="Paid To (Destination)" required>
                            <option value="" disabled selected>
                                Select a destination...
                            </option>
                            <For each={destinations()}>{(dest) => <option value={dest.id}>{dest.name}</option>}</For>
                        </SelectInput>
                    </div>
                </div>

                <div class="w-full h-px bg-zinc-200 border-t border-dashed" />

                {/* Section 1: Main Details */}
                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Expense Details</h2>
                    <SelectInput
                        name="entity_id"
                        label="Expense For (Entity)"
                        required
                        onChange={(e) => setSelectedEntityId(e.currentTarget.value)}
                    >
                        <option value="" disabled selected>
                            Select an entity...
                        </option>
                        <For each={entities()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                    </SelectInput>

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
                            onInput={(e) => setRate(parseFloat(e.currentTarget.value) || 0)}
                            required
                        />
                        <TextInput name="amount" label="Total Amount (₹)" value={amount()} type="number" readOnly />
                    </div>
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

                <div class="w-full h-px bg-zinc-200 border-t border-dashed" />

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

                {/* Submit Button */}
                <div class="pt-4">
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

// --- REUSABLE UI COMPONENTS ---

type InputProps = {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    readOnly?: boolean;
    value?: string | number;
    placeholder?: string;
    step?: string;
    onInput?: JSX.EventHandlerUnion<HTMLInputElement, Event>;
};

function TextInput(props: InputProps) {
    return (
        <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all">
            <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                {props.label}
            </label>
            <input
                type={props.type || 'text'}
                name={props.name}
                required={props.required}
                readOnly={props.readOnly}
                value={props.value}
                placeholder={props.placeholder}
                step={props.step}
                onInput={props.onInput}
                class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 disabled:opacity-50"
                disabled={props.readOnly}
            />
        </div>
    );
}

type SelectProps = {
    name: string;
    label: string;
    children: JSX.Element;
    required?: boolean;
    onChange?: JSX.EventHandlerUnion<HTMLSelectElement, Event>;
};

function SelectInput(props: SelectProps) {
    return (
        <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all">
            <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                {props.label}
            </label>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </div>
            <select
                name={props.name}
                required={props.required}
                onChange={props.onChange}
                class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer"
            >
                {props.children}
            </select>
        </div>
    );
}
