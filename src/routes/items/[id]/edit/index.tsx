import { For, Index, Show, createEffect, createSignal } from 'solid-js';
import { action, createAsync, query, redirect, useParams, useSubmission } from '@solidjs/router';
import { eq } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { EntityType, EntityVariantWarehouse, EntityWarehouse } from '~/drizzle/schema';
import { requireAuth } from '~/lib/require-auth';

type VariantInput = {
    id?: string;
    length: string;
    width: string;
    height: string;
    thickness: string;
    dimension_unit: string;
    thickness_unit: string;
};

type NormalizedVariant = {
    id?: string;
    length: string | null;
    width: string | null;
    height: string | null;
    thickness: string | null;
    dimension_unit: string | null;
    thickness_unit: string | null;
};

type ActionResponse = {
    success: boolean;
    error?: string;
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

const loadItemForEdit = query(async (itemId: string) => {
    'use server';

    const item = await db
        .select({
            id: EntityWarehouse.id,
            name: EntityWarehouse.name,
            unit: EntityWarehouse.unit,
            type: EntityWarehouse.type,
        })
        .from(EntityWarehouse)
        .where(eq(EntityWarehouse.id, itemId))
        .then((rows) => rows[0] ?? null);

    const variants = await db
        .select({
            id: EntityVariantWarehouse.id,
            length: EntityVariantWarehouse.length,
            width: EntityVariantWarehouse.width,
            height: EntityVariantWarehouse.height,
            thickness: EntityVariantWarehouse.thickness,
            dimension_unit: EntityVariantWarehouse.dimension_unit,
            thickness_unit: EntityVariantWarehouse.thickness_unit,
        })
        .from(EntityVariantWarehouse)
        .where(eq(EntityVariantWarehouse.entity_id, itemId))
        .orderBy(EntityVariantWarehouse.created_at);

    return {
        item,
        variants,
    };
}, 'item-for-edit');

export const updateItem = action(async (formData: FormData): Promise<ActionResponse> => {
    'use server';
    await requireAuth(['warehouse-user']);

    const getStringField = (key: string) => {
        const value = formData.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };

    const id = getStringField('id');
    const name = getStringField('name');
    const unit = getStringField('unit');
    const type = 'cash';
    const variantsRaw = getStringField('variants');

    if (!id) {
        return { success: false, error: 'Item id is missing.' };
    }
    if (!name) {
        return { success: false, error: 'Item name is required.' };
    }
    if (!unit) {
        return { success: false, error: 'Unit is required.' };
    }


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
                      id: raw.id,
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
        let deleteErrorMessage: string | null = null;
        
        await db.transaction(async (tx) => {
            const updated = await tx
                .update(EntityWarehouse)
                .set({ name, unit, type })
                .where(eq(EntityWarehouse.id, id))
                .returning();

            if (updated.length === 0) {
                tx.rollback();
                return;
            }

            const originalVariants = await tx
                .select({ id: EntityVariantWarehouse.id })
                .from(EntityVariantWarehouse)
                .where(eq(EntityVariantWarehouse.entity_id, id));

            const originalVariantIds = new Set(originalVariants.map((v) => v.id));
            const submittedVariantIds = new Set<string>();

            const variantsToUpdate: (NormalizedVariant & { id: string })[] = [];
            const variantsToCreate: NormalizedVariant[] = [];

            for (const variant of normalizedVariants) {
                if (variant.id && originalVariantIds.has(variant.id)) {
                    variantsToUpdate.push({ ...variant, id: variant.id });
                    submittedVariantIds.add(variant.id);
                } else {
                    variantsToCreate.push(variant);
                }
            }

            const variantsToDelete = [...originalVariantIds].filter((variantId) => !submittedVariantIds.has(variantId));

            // Perform updates
            for (const variant of variantsToUpdate) {
                await tx
                    .update(EntityVariantWarehouse)
                    .set({
                        length: variant.length,
                        width: variant.width,
                        height: variant.height,
                        thickness: variant.thickness,
                        dimension_unit: variant.dimension_unit,
                        thickness_unit: variant.thickness_unit,
                    })
                    .where(eq(EntityVariantWarehouse.id, variant.id));
            }

            // Perform creates
            if (variantsToCreate.length > 0) {
                await tx.insert(EntityVariantWarehouse).values(
                    variantsToCreate.map((variant) => ({
                        entity_id: id,
                        length: variant.length,
                        width: variant.width,
                        height: variant.height,
                        thickness: variant.thickness,
                        dimension_unit: variant.dimension_unit,
                        thickness_unit: variant.thickness_unit,
                    })),
                );
            }

            // Perform deletes
            for (const variantId of variantsToDelete) {
                try {
                    await tx.delete(EntityVariantWarehouse).where(eq(EntityVariantWarehouse.id, variantId));
                } catch (error: unknown) {
                    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23503') {
                        deleteErrorMessage = "Some variants couldn't be deleted as they are part of existing transactions, but other changes were saved.";
                    } else {
                        throw error;
                    }
                }
            }
        });
        
        if (deleteErrorMessage) {
            return { success: false, error: deleteErrorMessage };
        }


        throw redirect(`/items`);
    } catch (error: unknown) {
        if (error instanceof Response) throw error;
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

export default function EditItemPage() {
    const params = useParams<{ id: string }>();
    const submission = useSubmission(updateItem);
    const data = createAsync(() => loadItemForEdit(params.id));
    const [initialized, setInitialized] = createSignal(false);
    const [name, setName] = createSignal('');
    const [unit, setUnit] = createSignal('');
    const [variants, setVariants] = createSignal<VariantInput[]>([]);

    createEffect(() => {
        const payload = data();
        if (!payload || initialized()) return;

        setName(payload.item?.name ?? '');
        setUnit(payload.item?.unit ?? '');
        setVariants(
            payload.variants.map((variant) => ({
                id: variant.id,
                length: variant.length ? String(variant.length) : '',
                width: variant.width ? String(variant.width) : '',
                height: variant.height ? String(variant.height) : '',
                thickness: variant.thickness ? String(variant.thickness) : '',
                dimension_unit: variant.dimension_unit ?? '',
                thickness_unit: variant.thickness_unit ?? '',
            })),
        );
        setInitialized(true);
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

    const variantInputClass =
        'w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-black/40 focus:ring-1 focus:ring-black/10';
    const variantLabelClass = 'text-[10px] uppercase tracking-wider text-zinc-600 font-bold mb-1.5 block';

    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-screen">
            <div class="w-full max-w-3xl animate-in fade-in zoom-in-95 duration-500">
                <div class="mb-8">
                    <h1 class="text-xl font-medium text-black tracking-tight">Edit Item</h1>
                    <p class="text-zinc-500 text-sm mt-1">Update item details and variants.</p>
                </div>

                <form action={updateItem} method="post" class="flex flex-col gap-8">
                    <div class="flex-1 space-y-8">
                        <input type="hidden" name="id" value={params.id} />
                        {/* Main Item Details */}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    value={name()}
                                    onInput={(e) => setName(e.currentTarget.value)}
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
                                    value={unit()}
                                    onChange={(e) => setUnit(e.currentTarget.value)}
                                    class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black"
                                >
                                    <option value="" disabled>
                                        Select unit...
                                    </option>
                                    <option value="kg">kg</option>
                                    <option value="ton">ton</option>
                                    <option value="pcs">pcs</option>
                                    <option value="m">m</option>
                                    <option value="sqm">sqm</option>
                                    <option value="cft">cft</option>
                                    <option value="ltr">ltr</option>
                                    <option value="bag">bag</option>
                                </select>
                            </div>
                        </div>



                        <div class="space-y-5">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h2 class="text-sm font-semibold text-black">Variants</h2>
                                    <p class="text-xs text-zinc-600">Optional dimensions for this item.</p>
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

                                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                                            class={`${variantInputClass} appearance-none cursor-pointer [&>option]:bg-white [&>option]:text-black`}
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
                            {submission.pending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
