import { createSignal, Show } from 'solid-js';
import { useSubmission } from '@solidjs/router';
import { action } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';

type ActionResponse = {
    success: boolean;
    error?: string;
};

export const createDestination = action(async (formData: FormData): Promise<ActionResponse> => {
    'use server';

    // Artificial delay to show off the loading state (optional, remove in prod)
    // await new Promise(r => setTimeout(r, 800));

    const name = String(formData.get('name') || '').trim();
    const isWarehouse = formData.get('is_warehouse') === 'on';

    if (!name) {
        return { success: false, error: 'Destination name is required.' };
    }

    try {
        await db
            .insert(Destination)
            .values({
                name,
                is_warehouse: isWarehouse,
            })
            .returning();

        return { success: true };
    } catch (e: any) {
        if (e.code === '23505') {
            return { success: false, error: 'This destination name is already taken.' };
        }

        console.error('Database error:', e);
        return { success: false, error: 'System error. Please try again.' };
    }
});

export default function CreateDestinationPage() {
    const submission = useSubmission(createDestination);
    const [isWarehouse, setIsWarehouse] = createSignal(false);

    return (
        <div class="w-full flex items-center justify-center p-6 bg-brand min-h-[calc(85vh)]">
            <div class="w-full max-w-3xl animate-in fade-in zoom-in-95 duration-500">
                {/* Header */}
                <div class="mb-8">
                    <h1 class="text-xl font-medium text-black tracking-tight">New Site/Godown</h1>
                    <p class="text-zinc-500 text-sm mt-1">Add a location to your network.</p>
                </div>

                <form action={createDestination} method="post" class="space-y-4">
                    <div class="group relative bg-white border border-zinc-200 focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 rounded-xl transition-all duration-200">
                        <label
                            for="name"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 select-none group-focus-within:text-zinc-700 transition-colors"
                        >
                            Destination Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            required
                            placeholder="e.g. Pune Central Hub"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400 transition-colors"
                        />
                    </div>

                    {/* Warehouse Toggle */}
                    <div
                        class="flex items-center justify-between px-3.5 py-3 bg-white border border-zinc-200 rounded-xl cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
                        onClick={() => setIsWarehouse(!isWarehouse())}
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium text-zinc-700 group-hover:text-black transition-colors">
                                Is this a godown?
                            </span>
                        </div>

                        <input type="checkbox" name="is_warehouse" checked={isWarehouse()} class="hidden" />

                        {/* Switch UI */}
                        <div
                            class={`relative w-9 h-5 rounded-full transition-colors duration-200 ${isWarehouse() ? 'bg-black' : 'bg-zinc-300'}`}
                        >
                            <div
                                class={`absolute top-1 left-1 w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${isWarehouse() ? 'translate-x-4 bg-white' : 'translate-x-0 bg-zinc-600'}`}
                            />
                        </div>
                    </div>

                    <Show when={submission.result?.success === false}>
                        <div class="px-3 py-2 bg-red-500/10 border border-red-500/10 rounded-lg flex items-center gap-2.5 animate-in slide-in-from-top-1">
                            <div class="w-1 h-1 bg-red-500 rounded-full" />
                            <p class="text-[11px] text-red-400 font-medium leading-none">{submission.result?.error}</p>
                        </div>
                    </Show>

                    <button
                        type="submit"
                        disabled={submission.pending}
                        class="w-full bg-secondary hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed text-brand font-semibold text-sm rounded-xl py-3 transition-all active:scale-[0.98]"
                    >
                        {submission.pending ? 'Creating...' : 'Create'}
                    </button>
                </form>
            </div>
        </div>
    );
}
