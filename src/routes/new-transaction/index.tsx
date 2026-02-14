import { createMemo, createSignal, For, Show, Suspense } from 'solid-js';
import type { JSX } from 'solid-js';
import { action, createAsync, query, redirect, useSubmission } from '@solidjs/router';
import { db } from '~/drizzle/client';
import {
    Destination,
    EntityVariantWarehouse,
    EntityWarehouse,
    TransactionType as TransactionTypeValues,
    WarehouseTransaction,
} from '~/drizzle/schema';
import { requireAuth } from '~/lib/require-auth';

type WarehouseTransactionType = (typeof TransactionTypeValues)[number];

const isTransactionType = (value: string): value is WarehouseTransactionType =>
    TransactionTypeValues.includes(value as WarehouseTransactionType);

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
    await requireAuth(['warehouse-user']);

    const getStringField = (key: string) => {
        const value = formData.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };

    const entityId = getStringField('entity_id');
    const variantId = getStringField('variant_id');
    const sourceId = getStringField('source_id');
    const destId = getStringField('destination_id');
    const quantity = Number.parseFloat(getStringField('quantity'));

    if (!entityId || !sourceId || !destId) {
        return { success: false, error: 'Please fill in all required fields.' };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: 'Quantity must be a positive number.' };
    }

    try {
        await db.insert(WarehouseTransaction).values({
            entity_id: entityId,
            entity_variant_id: variantId || null,
            source_id: sourceId,
            destination_id: destId,
            quantity: String(quantity),
            type: 'debit',
        });

        throw redirect(`/destination/${sourceId}`);
    } catch (error) {
        if (error instanceof Response) throw error;
        console.error(error);
        return { success: false, error: 'Failed to record transaction.' };
    }
});

export default function NewTransactionPage() {
    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-[85vh] font-sans text-black">
            <div class="w-full max-w-4xl animate-in fade-in zoom-in-95 duration-500">
                <Suspense fallback={<FormSkeleton />}>
                    <TransactionFormContent />
                </Suspense>
            </div>
        </div>
    );
}

function TransactionFormContent() {
    const data = createAsync(() => loadTransactionFormData());
    const submission = useSubmission(createTransaction);
    const entities = () => data()?.entities || [];
    const variants = () => data()?.variants || [];
    const destinations = () => data()?.destinations || [];

    const [selectedEntityId, setSelectedEntityId] = createSignal<string>('');
    const availableVariants = createMemo(() => variants().filter((v) => v.entity_id === selectedEntityId()));
    const selectedUnit = createMemo(() => entities().find((e) => e.id === selectedEntityId())?.unit || 'Units');

    return (
        <div class="space-y-8">
            <div class="mb-10">
                <h1 class="text-2xl font-semibold text-black">New Transaction</h1>
                <p class="text-zinc-600 text-sm mt-1">Debit-only flow between source and destination.</p>
            </div>

            <form
                action={createTransaction}
                method="post"
                class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Route</h2>
                    <div class="gap-4 flex flex-col">
                        <SelectInput name="source_id" label="Source" required>
                            <option value="" disabled selected>
                                Select a source...
                            </option>
                            <For each={destinations()}>{(dest) => <option value={dest.id}>{dest.name}</option>}</For>
                        </SelectInput>
                        <SelectInput name="destination_id" label="Destination" required>
                            <option value="" disabled selected>
                                Select a destination...
                            </option>
                            <For each={destinations()}>{(dest) => <option value={dest.id}>{dest.name}</option>}</For>
                        </SelectInput>
                    </div>
                </div>

                <div class="w-full h-px bg-zinc-200 border-t border-dashed border-zinc-200" />

                <div class="space-y-5">
                    <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">
                        Transaction Details
                    </h2>

                    <div class="flex flex-col gap-4">
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

                <div class="pt-2">
                    <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                        <label
                            for="qty"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 group-focus-within:text-zinc-800 transition-colors"
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
                                class="w-full bg-transparent text-black text-xl font-medium px-3.5 pt-7 pb-3 outline-none placeholder:text-zinc-300 transition-colors"
                            />
                            <span class="pr-4 text-zinc-500 text-sm font-mono">{selectedUnit()}</span>
                        </div>
                    </div>
                </div>

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
                        class="w-full bg-black hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-4 transition-all active:scale-[0.99]"
                    >
                        {submission.pending ? 'Recording...' : 'Confirm Transaction'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function FormSkeleton() {
    return (
        <div class="space-y-8 opacity-40">
            <div class="space-y-4">
                <div class="h-3 w-24 bg-zinc-200 rounded animate-pulse" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="h-[66px] bg-zinc-200 rounded-xl animate-pulse" />
                    <div class="h-[66px] bg-zinc-200 rounded-xl animate-pulse" />
                </div>
            </div>

            <div class="w-full h-px bg-zinc-200 border-t border-dashed border-zinc-200" />

            <div class="space-y-4">
                <div class="h-3 w-20 bg-zinc-200 rounded animate-pulse" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="h-[66px] bg-zinc-200 rounded-xl animate-pulse" />
                    <div class="h-[66px] bg-zinc-200 rounded-xl animate-pulse" />
                </div>
            </div>

            <div class="pt-2">
                <div class="h-[74px] bg-zinc-200 rounded-xl animate-pulse" />
            </div>

            <div class="pt-4">
                <div class="h-[54px] bg-zinc-200 rounded-xl animate-pulse" />
            </div>
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
        <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
            <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 select-none group-focus-within:text-zinc-800 transition-colors">
                {props.label}
            </label>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 group-hover:text-zinc-700">
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
                class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black"
            >
                {props.children}
            </select>
        </div>
    );
}
