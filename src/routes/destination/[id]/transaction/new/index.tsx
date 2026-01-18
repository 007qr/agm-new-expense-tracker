import { createSignal, createMemo, Show, For, Suspense } from 'solid-js';
import type { JSX } from 'solid-js';
import { query, action, redirect, createAsync, useSubmission, useParams } from '@solidjs/router';
import { db } from '~/drizzle/client'; // Adjust path if needed
import {
    WarehouseTransaction,
    EntityWarehouse,
    EntityVariantWarehouse,
    Destination,
    TransactionType as TransactionTypeValues,
} from '~/drizzle/schema'; // Adjust path if needed

type WarehouseTransactionType = (typeof TransactionTypeValues)[number];

const isTransactionType = (value: string): value is WarehouseTransactionType =>
    TransactionTypeValues.includes(value as WarehouseTransactionType);

// ==========================================
// 1. SERVER ACTIONS & LOADERS
// ==========================================

export const loadTransactionFormData = query(async () => {
    'use server';
    const [entities, variants, destinations] = await Promise.all([
        db
            .select({ id: EntityWarehouse.id, name: EntityWarehouse.name, unit: EntityWarehouse.unit })
            .from(EntityWarehouse),
        db.select().from(EntityVariantWarehouse),
        db.select({ id: Destination.id, name: Destination.name }).from(Destination),
    ]);

    return { entities, variants, destinations };
}, 'transaction-form-data');

export const createTransaction = action(async (formData: FormData) => {
    'use server';

    const getStringField = (key: string) => {
        const value = formData.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };

    const entityId = getStringField('entity_id');
    const variantId = getStringField('variant_id');
    const sourceId = getStringField('source_id');
    const destId = getStringField('destination_id');
    const quantity = Number.parseFloat(getStringField('quantity'));
    const rawTransactionType = getStringField('transaction_type');

    // Validation
    if (!entityId || !sourceId || !destId || !rawTransactionType) {
        return { success: false, error: 'Please fill in all required fields.' };
    }
    if (!isTransactionType(rawTransactionType)) {
        return { success: false, error: 'Invalid transaction type.' };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: 'Quantity must be a positive number.' };
    }

    const transactionType = rawTransactionType;

    try {
        await db.insert(WarehouseTransaction).values({
            entity_id: entityId,
            entity_variant_id: variantId || null,
            source_id: sourceId,
            destination_id: destId,
            quantity: String(quantity),
            type: transactionType,
        });

        throw redirect('/dashboard');
    } catch (error) {
        if (error instanceof Response) throw error;
        console.error(error);
        return { success: false, error: 'Failed to record transaction.' };
    }
});

// ==========================================
// 2. MAIN PAGE CONTAINER
// ==========================================
export default function NewTransactionPage() {
    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-[85vh] font-sans text-[#fff]">
            <div class="w-full max-w-4xl animate-in fade-in zoom-in-95 duration-500">
                <Suspense fallback={<FormSkeleton />}>
                    <TransactionFormContent />
                </Suspense>
            </div>
        </div>
    );
}

function TransactionFormContent() {
    const params = useParams<{ id?: string }>();
    const data = createAsync(() => loadTransactionFormData());
    const submission = useSubmission(createTransaction);
    const entities = () => data()?.entities || [];
    const variants = () => data()?.variants || [];
    const destinations = () => data()?.destinations || [];

    const [selectedEntityId, setSelectedEntityId] = createSignal<string>('');
    const [transactionType, setTransactionType] = createSignal<WarehouseTransactionType>('credit');

    const availableVariants = createMemo(() => variants().filter((v) => v.entity_id === selectedEntityId()));
    const selectedUnit = createMemo(() => entities().find((e) => e.id === selectedEntityId())?.unit || 'Units');
    const destinationName = createMemo(() => {
        const destinationId = params.id;
        return destinations().find((dest) => dest.id === destinationId)?.name || 'Destination';
    });

    return (
        <div class="space-y-8">
            {/* Header */}
            <div class="mb-10">
                <h1 class="text-2xl font-semibold text-[#fff]">Record for {destinationName()}</h1>
                <p class="text-[#fff]/60 text-sm mt-1">Transfer stock between warehouses or endpoints.</p>
            </div>

            <form
                action={createTransaction}
                method="post"
                class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
                {/* HIDDEN INPUTS for Params & Type */}
                <input type="hidden" name="source_id" value={params.id ?? ''} />
                <input type="hidden" name="transaction_type" value={transactionType()} />

                {/* --- SECTION 1: TYPE & ITEM --- */}
                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-[#fff]/50 uppercase tracking-wide mb-4">
                        Transaction Details
                    </h2>

                    {/* Credit / Debit Toggles */}
                    <div class="grid grid-cols-2 gap-2 p-1 bg-[#fff]/5 border border-[#fff]/10 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setTransactionType('credit')}
                            class={`py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                                transactionType() === 'credit'
                                    ? 'bg-[#fff] text-brand shadow-lg'
                                    : 'text-[#fff]/40 hover:text-[#fff] hover:bg-[#fff]/5'
                            }`}
                        >
                            Credit (In)
                        </button>
                        <button
                            type="button"
                            onClick={() => setTransactionType('debit')}
                            class={`py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                                transactionType() === 'debit'
                                    ? 'bg-[#fff] text-brand shadow-lg'
                                    : 'text-[#fff]/40 hover:text-[#fff] hover:bg-[#fff]/5'
                            }`}
                        >
                            Debit (Out)
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectInput
                            name="entity_id"
                            label="Item / Entity"
                            onChange={(e) => setSelectedEntityId(e.currentTarget.value)}
                            required
                        >
                            <option value="" disabled selected>
                                Select an item...
                            </option>
                            <For each={entities()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                        </SelectInput>

                        <div
                            class={`transition-opacity duration-300 ${!selectedEntityId() ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                        >
                            <SelectInput name="variant_id" label="Variant (Optional)">
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
                </div>

                <div class="w-full h-px bg-[#fff]/10 border-t border-dashed border-[#fff]/10" />

                {/* --- SECTION 2: LOGISTICS --- */}
                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-[#fff]/50 uppercase tracking-wide mb-4">Logistics</h2>

                    {/* Just Destination Select */}
                    <SelectInput name="destination_id" label="Destination (To)" required>
                        <option value="" disabled selected>
                            Select Target Destination...
                        </option>
                        <For each={destinations()}>{(dest) => <option value={dest.id}>{dest.name}</option>}</For>
                    </SelectInput>
                </div>

                {/* --- SECTION 3: QUANTITY --- */}
                <div class="pt-2">
                    <div class="group relative bg-[#fff]/5 border border-[#fff]/10 focus-within:border-[#fff]/40 focus-within:ring-1 focus-within:ring-[#fff]/20 rounded-xl transition-all duration-200">
                        <label
                            for="qty"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-[#fff]/40 group-focus-within:text-[#fff]/80 transition-colors"
                        >
                            Quantity to Move
                        </label>
                        <div class="flex items-baseline">
                            <input
                                id="qty"
                                name="quantity"
                                type="number"
                                step="0.01"
                                required
                                placeholder="0.00"
                                class="w-full bg-transparent text-[#fff] text-xl font-medium px-3.5 pt-7 pb-3 outline-none placeholder:text-[#fff]/20 transition-colors"
                            />
                            <span class="pr-4 text-[#fff]/40 text-sm font-mono">{selectedUnit()}</span>
                        </div>
                    </div>
                </div>

                {/* --- FEEDBACK & SUBMIT --- */}
                <Show when={submission.result?.success === false}>
                    <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-1">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            class="w-4 h-4 text-red-400"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <p class="text-xs text-red-400 font-medium">{submission.result?.error}</p>
                    </div>
                </Show>

                <div class="pt-4">
                    <button
                        type="submit"
                        disabled={submission.pending}
                        class="w-full bg-[#fff] hover:bg-[#e5e5e5] disabled:opacity-50 disabled:cursor-not-allowed text-brand font-bold text-sm rounded-xl py-4 transition-all active:scale-[0.99] shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    >
                        {submission.pending ? 'Recording...' : 'Confirm Transaction'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ==========================================
// 4. SKELETON LOADER
// ==========================================

function FormSkeleton() {
    return (
        <div class="space-y-8 opacity-40">
            {/* Item Details Skeleton */}
            <div class="space-y-4">
                <div class="h-3 w-24 bg-[#fff]/20 rounded animate-pulse" />
                <div class="h-[66px] bg-[#fff]/10 rounded-xl animate-pulse" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="h-[66px] bg-[#fff]/10 rounded-xl animate-pulse" />
                    <div class="h-[66px] bg-[#fff]/10 rounded-xl animate-pulse" />
                </div>
            </div>

            <div class="w-full h-px bg-[#fff]/10 border-t border-dashed border-[#fff]/10" />

            {/* Logistics Skeleton */}
            <div class="space-y-4">
                <div class="h-3 w-20 bg-[#fff]/20 rounded animate-pulse" />
                <div class="h-[66px] bg-[#fff]/10 rounded-xl animate-pulse" />
            </div>

            {/* Quantity Skeleton */}
            <div class="pt-2">
                <div class="h-[74px] bg-[#fff]/10 rounded-xl animate-pulse" />
            </div>

            {/* Button Skeleton */}
            <div class="pt-4">
                <div class="h-[54px] bg-[#fff]/20 rounded-xl animate-pulse" />
            </div>
        </div>
    );
}

// ==========================================
// 5. UI COMPONENTS (Select Input)
// ==========================================

type SelectProps = {
    name: string;
    label: string;
    children: JSX.Element;
    required?: boolean;
    onChange?: JSX.EventHandlerUnion<HTMLSelectElement, Event>;
};

function SelectInput(props: SelectProps) {
    return (
        <div class="group relative bg-[#fff]/5 border border-[#fff]/10 focus-within:border-[#fff]/40 focus-within:ring-1 focus-within:ring-[#fff]/20 rounded-xl transition-all duration-200">
            <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-[#fff]/40 select-none group-focus-within:text-[#fff]/80 transition-colors">
                {props.label}
            </label>
            {/* Custom Arrow UI */}
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#fff]/40 group-hover:text-[#fff]/60">
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
                class="w-full bg-transparent text-[#fff] text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer [&>option]:bg-brand [&>option]:text-[#fff]"
            >
                {props.children}
            </select>
        </div>
    );
}
