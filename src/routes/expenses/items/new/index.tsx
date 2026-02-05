import { Show } from 'solid-js';
import { action, redirect, useSubmission } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Entity } from '~/drizzle/schema';

type ActionResponse = {
    success: boolean;
    error?: string;
};

export const createExpenseItem = action(async (formData: FormData): Promise<ActionResponse> => {
    'use server';
    
    const getStringField = (key: string) => {
        const value = formData.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };

    const name = getStringField('name');
    const unit = getStringField('unit');
    const type = 'payroll'; // Hardcoded for expense items

    if (!name) return { success: false, error: 'Item name is required.' };
    if (!unit) return { success: false, error: 'Unit is required.' };

    try {
        await db.insert(Entity).values({ name, unit, type });
        throw redirect(`/expenses/items`);
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

export default function CreateExpenseItemPage() {
    const submission = useSubmission(createExpenseItem);

    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-screen">
            <div class="w-full max-w-xl animate-in fade-in zoom-in-95 duration-500">
                <div class="mb-8">
                    <h1 class="text-xl font-medium text-black tracking-tight">New Expense Item</h1>
                    <p class="text-zinc-500 text-sm mt-1">Create a new service, labor, or other expense-related item.</p>
                </div>

                <form action={createExpenseItem} method="post" class="flex flex-col gap-8">
                    <div class="flex-1 space-y-8">
                        {/* Main Item Details */}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                                <label
                                    for="name"
                                    class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 select-none group-focus-within:text-zinc-800 transition-colors"
                                >
                                    Item/Service Name
                                </label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    placeholder="e.g. Daily Labor"
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
                                    <option value="day">Day</option>
                                    <option value="nos">Nos</option>
                                    <option value="trip">Trip</option>
                                    <option value="month">Month</option>
                                    <option value="sqft">Sqft</option>
                                    <option value="rft">Rft</option>
                                    <option value="fixed">Fixed</option>
                                </select>
                            </div>
                        </div>

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
                            {submission.pending ? 'Creating...' : 'Create Expense Item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}