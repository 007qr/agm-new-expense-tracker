import { createAsync, revalidate, useSubmission } from '@solidjs/router';
import { asc, sql } from 'drizzle-orm';
import { createEffect, createSignal, For, Index, onCleanup, onMount, Show, Suspense } from 'solid-js';
import { query } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Entity } from '~/drizzle/schema';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';
import Sheet from '~/components/Sheet';
import { createItem } from '~/routes/expenses/items/new';
import { loadItem, updateItem } from '~/routes/expenses/items/[id]/edit';
import { VirtualizedCombobox, type ComboboxOption } from '~/components/VirtualizedCombobox';

const UNITS: ComboboxOption[] = [
    'bag','brass','cft','cm','cu ft','cu m','day','ft','g','hr',
    'in','kg','ltr','m','min','mm','nos','pcs','piece','sq ft','sq m','sqm','ton',
].map((u) => ({ id: u, name: u }));

type VariantInput = {
    id?: string;
    length: string;
    width: string;
    height: string;
    thickness: string;
    dimension_unit: string;
    thickness_unit: string;
};

const emptyVariant = (): VariantInput => ({
    length: '',
    width: '',
    height: '',
    thickness: '',
    dimension_unit: '',
    thickness_unit: '',
});

const loadItems = query(async (limit: number, offset: number) => {
    'use server';

    const items = await db
        .select({
            id: Entity.id,
            name: Entity.name,
        })
        .from(Entity)
        .orderBy(asc(Entity.name))
        .limit(limit)
        .offset(offset);

    const totalCount = await db
        .select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(Entity)
        .then((rows) => rows[0]?.total ?? 0);

    return { items, totalCount };
}, 'site-items-list');

export default function SiteItemsPage() {
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);

    const items = createAsync(() => loadItems(pageSize(), (page() - 1) * pageSize()));
    const totalCount = () => items()?.totalCount ?? 0;

    // Sheet state
    const [sheetOpen, setSheetOpen] = createSignal(false);
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [loadingItemId, setLoadingItemId] = createSignal<string | null>(null);

    // Form state (controlled for both create & edit)
    const [name, setName] = createSignal('');
    const [unit, setUnit] = createSignal('');
    const [type, setType] = createSignal('');
    const [variants, setVariants] = createSignal<VariantInput[]>([]);

    const createSubmission = useSubmission(createItem);
    const updateSubmission = useSubmission(updateItem);

    const isEditing = () => editingId() !== null;
    const currentAction = () => (isEditing() ? updateItem : createItem);
    const submission = () => (isEditing() ? updateSubmission : createSubmission);

    const resetForm = () => {
        setName('');
        setUnit('');
        setType('');
        setVariants([]);
        setEditingId(null);
    };

    const openCreateSheet = () => {
        resetForm();
        setSheetOpen(true);
    };

    const openEditSheet = async (itemId: string) => {
        setLoadingItemId(itemId);
        try {
            const data = await loadItem(itemId);
            if (data) {
                setEditingId(itemId);
                setName(data.name);
                setUnit(data.unit);
                setType(data.type);
                setVariants(data.variants);
                setSheetOpen(true);
            }
        } catch (e) {
            console.error('Failed to load item:', e);
        } finally {
            setLoadingItemId(null);
        }
    };

    onMount(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.code !== 'KeyA') return;
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement ||
                (e.target as HTMLElement).isContentEditable
            ) return;
            e.preventDefault();
            openCreateSheet();
        };
        document.addEventListener('keydown', handleKeyDown);
        onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    });

    const updateVariant = (index: number, field: keyof VariantInput, value: string) => {
        setVariants((prev) => prev.map((variant, idx) => (idx === index ? { ...variant, [field]: value } : variant)));
    };

    const addVariant = () => {
        setVariants((prev) => [...prev, emptyVariant()]);
    };

    const removeVariant = (index: number) => {
        setVariants((prev) => prev.filter((_, idx) => idx !== index));
    };

    // Close sheet on success (either create or update)
    createEffect(() => {
        if (createSubmission.result?.success || updateSubmission.result?.success) {
            setSheetOpen(false);
            resetForm();
            revalidate('site-items-list');
        }
    });

    const variantInputClass =
        'w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-black/40 focus:ring-1 focus:ring-black/10';

    const variantLabelClass = 'text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5 block';

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-zinc-900 tracking-tight">Items</h1>
                    <p class="text-zinc-600 mt-2 text-base">A list of all items.</p>
                </div>

                <button
                    onClick={openCreateSheet}
                    class="bg-secondary text-brand px-4 py-2 rounded-md hover:bg-black/90 transition-colors"
                >
                    Add New Item
                </button>
            </div>

            <div class="bg-brand border border-zinc-200 rounded-2xl overflow-hidden shadow-xl shadow-black/5">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-200">
                                <th class="py-5 pl-8 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Item Name
                                </th>
                                <th class="py-5 pr-8 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                                    Actions
                                </th>
                            </tr>
                        </thead>

                        <tbody class="divide-y divide-zinc-200">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show when={items()?.items?.length} fallback={<EmptyState />}>
                                    <For each={items()?.items}>
                                        {(item) => (
                                            <tr class="group">
                                                <td class="py-5 pl-8 pr-4">
                                                    <span class="text-sm font-medium text-zinc-900">{item.name}</span>
                                                </td>

                                                <td class="py-5 pr-8 text-right">
                                                    <button
                                                        onClick={() => openEditSheet(item.id)}
                                                        disabled={loadingItemId() === item.id}
                                                        class="text-xs font-semibold text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-lg px-3 py-1.5 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
                                                    >
                                                        <Show when={loadingItemId() === item.id}>
                                                            <svg
                                                                class="animate-spin h-3 w-3"
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <circle
                                                                    class="opacity-25"
                                                                    cx="12"
                                                                    cy="12"
                                                                    r="10"
                                                                    stroke="currentColor"
                                                                    stroke-width="4"
                                                                />
                                                                <path
                                                                    class="opacity-75"
                                                                    fill="currentColor"
                                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                                />
                                                            </svg>
                                                        </Show>
                                                        Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        )}
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

            <Sheet
                open={sheetOpen()}
                onClose={() => {
                    setSheetOpen(false);
                    resetForm();
                }}
                title={isEditing() ? 'Edit Item' : 'New Item'}
            >
                <form action={currentAction()} method="post" class="flex flex-col gap-6">
                    <Show when={isEditing()}>
                        <input type="hidden" name="id" value={editingId()!} />
                    </Show>

                    {/* Main Item Details */}
                    <div class="space-y-4">
                        <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                            <label
                                for="sheet-name"
                                class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                            >
                                Item Name
                            </label>
                            <input
                                id="sheet-name"
                                name="name"
                                type="text"
                                required
                                placeholder="e.g. Steel Rod"
                                value={name()}
                                onInput={(e) => setName(e.currentTarget.value)}
                                class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 transition-colors"
                            />
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <VirtualizedCombobox
                                name="unit"
                                label="Unit"
                                placeholder="Select unit..."
                                required
                                options={UNITS}
                                defaultValue={unit()}
                                onValueChange={setUnit}
                            />

                            <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                                <label
                                    for="sheet-type"
                                    class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                                >
                                    Type
                                </label>
                                <select
                                    id="sheet-type"
                                    name="type"
                                    required
                                    value={type()}
                                    onChange={(e) => setType(e.currentTarget.value)}
                                    class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer"
                                >
                                    <option value="" disabled>
                                        Select type...
                                    </option>
                                    <option value="cash">Cash</option>
                                    <option value="payroll">Payroll</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Variants Section */}
                    <div class="space-y-4">
                        <div class="flex items-end justify-between border-b border-zinc-200 pb-3">
                            <div>
                                <h2 class="text-sm font-semibold text-black">Size</h2>
                                <p class="text-xs text-zinc-600 mt-0.5">Define dimensions or thickness.</p>
                            </div>
                            <button
                                type="button"
                                onClick={addVariant}
                                class="bg-secondary text-brand hover:bg-black/90 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors active:scale-95"
                            >
                                + Add Variant
                            </button>
                        </div>

                        <Show
                            when={variants().length > 0}
                            fallback={
                                <div class="flex flex-col items-center justify-center border border-dashed border-zinc-200 rounded-xl p-6 text-center bg-zinc-50">
                                    <p class="text-sm text-zinc-500">No variants added yet.</p>
                                </div>
                            }
                        >
                            <div class="grid grid-cols-1 gap-4">
                                <Index each={variants()}>
                                    {(variant, index) => (
                                        <div class="relative bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors">
                                            <div class="flex items-center justify-between mb-3">
                                                <div class="flex items-center gap-2">
                                                    <span class="flex items-center justify-center w-5 h-5 rounded bg-black text-[10px] font-bold text-white">
                                                        {index + 1}
                                                    </span>
                                                    <span class="text-xs font-medium text-zinc-600">Variant</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeVariant(index)}
                                                    class="text-zinc-600 hover:text-red-500 transition-colors p-1"
                                                    title="Remove variant"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        class="w-4 h-4"
                                                    >
                                                        <path d="M18 6 6 18" />
                                                        <path d="m6 6 12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            <div class="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label class={variantLabelClass}>Length</label>
                                                    <input
                                                        type="text"
                                                        placeholder="0.00"
                                                        value={variant().length}
                                                        onInput={(e) =>
                                                            updateVariant(index, 'length', e.currentTarget.value)
                                                        }
                                                        class={variantInputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label class={variantLabelClass}>Width</label>
                                                    <input
                                                        type="text"
                                                        placeholder="0.00"
                                                        value={variant().width}
                                                        onInput={(e) =>
                                                            updateVariant(index, 'width', e.currentTarget.value)
                                                        }
                                                        class={variantInputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label class={variantLabelClass}>Height</label>
                                                    <input
                                                        type="text"
                                                        placeholder="0.00"
                                                        value={variant().height}
                                                        onInput={(e) =>
                                                            updateVariant(index, 'height', e.currentTarget.value)
                                                        }
                                                        class={variantInputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label class={variantLabelClass}>Dim. Unit</label>
                                                    <select
                                                        value={variant().dimension_unit}
                                                        onChange={(e) =>
                                                            updateVariant(
                                                                index,
                                                                'dimension_unit',
                                                                e.currentTarget.value,
                                                            )
                                                        }
                                                        class={`${variantInputClass} appearance-none cursor-pointer`}
                                                    >
                                                        <option value="" disabled>
                                                            -
                                                        </option>
                                                        <option value="mm">mm</option>
                                                        <option value="cm">cm</option>
                                                        <option value="m">m</option>
                                                        <option value="in">in</option>
                                                        <option value="ft">ft</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label class={variantLabelClass}>Thickness</label>
                                                    <input
                                                        type="text"
                                                        placeholder="0.00"
                                                        value={variant().thickness}
                                                        onInput={(e) =>
                                                            updateVariant(index, 'thickness', e.currentTarget.value)
                                                        }
                                                        class={variantInputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label class={variantLabelClass}>Thick. Unit</label>
                                                    <select
                                                        value={variant().thickness_unit}
                                                        onChange={(e) =>
                                                            updateVariant(
                                                                index,
                                                                'thickness_unit',
                                                                e.currentTarget.value,
                                                            )
                                                        }
                                                        class={`${variantInputClass} appearance-none cursor-pointer`}
                                                    >
                                                        <option value="" disabled>
                                                            -
                                                        </option>
                                                        <option value="mm">mm</option>
                                                        <option value="cm">cm</option>
                                                        <option value="m">m</option>
                                                        <option value="in">in</option>
                                                        <option value="ft">ft</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Index>
                            </div>
                        </Show>
                    </div>

                    <input type="hidden" name="variants" value={JSON.stringify(variants())} />

                    <Show when={submission().result?.success === false}>
                        <div class="px-3 py-2 bg-red-500/10 border border-red-500/10 rounded-lg flex items-center gap-2.5">
                            <div class="w-1 h-1 bg-red-500 rounded-full" />
                            <p class="text-[11px] text-red-400 font-medium leading-none">
                                {submission().result?.error}
                            </p>
                        </div>
                    </Show>

                    <button
                        type="submit"
                        disabled={submission().pending}
                        class="w-full bg-secondary hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-brand font-semibold text-sm rounded-xl py-3 transition-all active:scale-[0.98]"
                    >
                        {submission().pending
                            ? isEditing()
                                ? 'Updating...'
                                : 'Creating...'
                            : isEditing()
                              ? 'Update Item'
                              : 'Create Item'}
                    </button>
                </form>
            </Sheet>
        </div>
    );
}

const EmptyState = () => (
    <tr>
        <td colspan={2} class="py-16 text-center">
            <div class="flex flex-col items-center justify-center gap-3">
                <p class="text-zinc-600 text-sm font-medium">No items found</p>
            </div>
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={Array.from({ length: 6 })}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-5 pl-8 pr-4">
                    <div class="h-4 w-40 bg-zinc-200 rounded"></div>
                </td>
                <td class="py-5 pr-8 text-right">
                    <div class="h-4 w-20 bg-zinc-200 rounded inline-block"></div>
                </td>
            </tr>
        )}
    </For>
);
