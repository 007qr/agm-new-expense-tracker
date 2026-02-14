import { Show, createSignal, For, Index } from 'solid-js';
import { action, useSubmission } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Entity, EntityType, EntityVariant } from '~/drizzle/schema';
import { requireAuth } from '~/lib/require-auth';

// ... (Keep your existing types and helper functions exactly the same) ...
type VariantInput = {
    length: string;
    width: string;
    height: string;
    thickness: string;
    dimension_unit: string;
    thickness_unit: string;
};

type ActionResponse = {
    success: boolean;
    error?: string;
};

type NormalizedVariant = {
    length: string | null;
    width: string | null;
    height: string | null;
    thickness: string | null;
    dimension_unit: string | null;
    thickness_unit: string | null;
};

const emptyVariant = (): VariantInput => ({
    length: '',
    width: '',
    height: '',
    thickness: '',
    dimension_unit: '',
    thickness_unit: '',
});

const isEntityType = (value: string): value is (typeof EntityType)[number] =>
    EntityType.includes(value as (typeof EntityType)[number]);

export const createItem = action(async (formData: FormData): Promise<ActionResponse> => {
    'use server';
    await requireAuth(['expense-user']);

    const getStringField = (key: string) => {
        const value = formData.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };

    const name = getStringField('name');
    const unit = getStringField('unit');
    const type = getStringField('type');
    const variantsRaw = getStringField('variants');

    if (!name) return { success: false, error: 'Item name is required.' };
    if (!unit) return { success: false, error: 'Unit is required.' };
    if (!isEntityType(type)) return { success: false, error: 'Invalid item type selected.' };


    let parsedVariants: unknown = [];
    if (variantsRaw) {
        try {
            parsedVariants = JSON.parse(variantsRaw);
        } catch {
            return { success: false, error: 'Variants data is invalid.' };
        }
    }

    const toNumericString = (value: unknown) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const num = Number.parseFloat(trimmed);
        return Number.isFinite(num) ? String(num) : null;
    };

    const toOptionalString = (value: unknown) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    };

    const normalizedVariants: NormalizedVariant[] = Array.isArray(parsedVariants)
        ? parsedVariants
              .map((variant) => {
                  const raw = variant as Partial<VariantInput>;
                  return {
                      length: toNumericString(raw.length),
                      width: toNumericString(raw.width),
                      height: toNumericString(raw.height),
                      thickness: toNumericString(raw.thickness),
                      dimension_unit: toOptionalString(raw.dimension_unit),
                      thickness_unit: toOptionalString(raw.thickness_unit),
                  };
              })
              .filter((variant) => Boolean(variant.length || variant.width || variant.height || variant.thickness))
        : [];

    try {
        const [item] = await db.insert(Entity).values({ name, unit, type }).returning();

        if (normalizedVariants.length > 0) {
            await db.insert(EntityVariant).values(
                normalizedVariants.map((variant) => ({
                    entity_id: item.id,
                    length: variant.length,
                    width: variant.width,
                    height: variant.height,
                    thickness: variant.thickness,
                    dimension_unit: variant.dimension_unit,
                    thickness_unit: variant.thickness_unit,
                })),
            );
        }

        return { success: true };
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const errorCode = (error as { code?: string }).code;
            if (errorCode === '23505') {
                return { success: false, error: 'This item name is already taken.' };
            }
        }
        console.error('Database error:', error);
        return { success: false, error: 'System error. Please try again.' };
    }
});

export default function CreateItemPage() {
    const submission = useSubmission(createItem);
    const [variants, setVariants] = createSignal<VariantInput[]>([]);

    const updateVariant = (index: number, field: keyof VariantInput, value: string) => {
        setVariants((prev) => prev.map((variant, idx) => (idx === index ? { ...variant, [field]: value } : variant)));
    };

    const addVariant = () => {
        setVariants((prev) => [...prev, emptyVariant()]);
    };

    const removeVariant = (index: number) => {
        setVariants((prev) => prev.filter((_, idx) => idx !== index));
    };

    // Shared styles for the variant inputs to ensure consistency
    const variantInputClass =
        'w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-black/40 focus:ring-1 focus:ring-black/10';

    const variantLabelClass = 'text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5 block';

    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-screen">
            <div class="w-full max-w-3xl animate-in fade-in zoom-in-95 duration-500">
                <div class="mb-8">
                    <h1 class="text-xl font-medium text-black tracking-tight">New Item</h1>
                    <p class="text-zinc-500 text-sm mt-1">Create an item and define its variants.</p>
                </div>

                <form action={createItem} method="post" class="flex flex-col gap-8">
                    <div class="flex-1 space-y-8">
                        {/* Main Item Details */}
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                                <label
                                    for="name"
                                    class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                                >
                                    Item Name
                                </label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    placeholder="e.g. Steel Rod"
                                    class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 transition-colors"
                                />
                            </div>

                            <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                                <label
                                    for="unit"
                                    class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                                >
                                    Unit
                                </label>
                                <select
                                    id="unit"
                                    name="unit"
                                    required
                                    class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black"
                                >
                                    <option value="" disabled selected>
                                        Select unit...
                                    </option>
                                    <option value="kg">kg</option>
                                    <option value="ton">ton</option>
                                    <option value="pcs">pcs</option>
                                    <option value="m">m</option>
                                    <option value="sqm">sqm</option>
                                    <option value="cft">cft</option>
                                    <option value="ltr">ltr</option>
                                </select>
                            </div>
                            <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                                <label
                                    for="type"
                                    class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                                >
                                    Type
                                </label>
                                <select
                                    id="type"
                                    name="type"
                                    required
                                    class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black"
                                >
                                    <option value="" disabled selected>
                                        Select type...
                                    </option>
                                    <option value="cash">Cash</option>
                                    <option value="payroll">Payroll</option>
                                </select>
                            </div>
                        </div>



                        {/* Variants Section */}
                        <div class="space-y-5">
                            <div class="flex items-end justify-between border-b border-zinc-200 pb-4">
                                <div>
                                    <h2 class="text-sm font-semibold text-black">Size</h2>
                                    <p class="text-xs text-zinc-600 mt-0.5">
                                        Define dimensions or thickness for this item.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addVariant}
                                    class="bg-secondary text-brand hover:bg-black/90 text-xs font-semibold rounded-lg px-4 py-2 transition-colors active:scale-95"
                                >
                                    + Add Variant
                                </button>
                            </div>

                            <Show
                                when={variants().length > 0}
                                fallback={
                                    <div class="flex flex-col items-center justify-center border border-dashed border-zinc-200 rounded-xl p-8 text-center bg-zinc-50">
                                        <p class="text-sm text-zinc-500">No variants added yet.</p>
                                    </div>
                                }
                            >
                                <div class="grid grid-cols-1 gap-4">
                                    <Index each={variants()}>
                                        {(variant, index) => (
                                            <div class="relative bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors">
                                                {/* Header */}
                                                <div class="flex items-center justify-between mb-4">
                                                    <div class="flex items-center gap-2">
                                                        <span class="flex items-center justify-center w-5 h-5 rounded bg-black text-[10px] font-bold text-white">
                                                            {index + 1}
                                                        </span>
                                                        <span class="text-xs font-medium text-zinc-600">
                                                            Variant Dimensions
                                                        </span>
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

                                                {/* Grid Inputs */}
                                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {/* Length */}
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

                                                    {/* Width */}
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

                                                    {/* Height */}
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

                                                    {/* Dimension Unit */}
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
                                                            class={`${variantInputClass} appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black`}
                                                        >
                                                            <option value="" disabled selected>
                                                                -
                                                            </option>
                                                            <option value="mm">mm</option>
                                                            <option value="cm">cm</option>
                                                            <option value="m">m</option>
                                                            <option value="in">in</option>
                                                            <option value="ft">ft</option>
                                                        </select>
                                                    </div>

                                                    {/* Thickness */}
                                                    <div class="col-span-1 md:col-start-1">
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

                                                    {/* Thickness Unit */}
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
                                                            class={`${variantInputClass} appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black`}
                                                        >
                                                            <option value="" disabled selected>
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

                        <Show when={submission.result?.success === false}>
                            <div class="px-4 py-3 bg-red-500/10 border border-red-500/10 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-1">
                                <div class="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                                <p class="text-xs text-red-400 font-medium">{submission.result?.error}</p>
                            </div>
                        </Show>
                    </div>

                    <div class="sticky bottom-0 bg-brand pt-4 pb-2">
                        <button
                            type="submit"
                            disabled={submission.pending}
                            class="w-full bg-secondary hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-brand font-semibold text-sm rounded-xl py-3.5 transition-all active:scale-[0.99]"
                        >
                            {submission.pending ? 'Creating...' : 'Create Item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}