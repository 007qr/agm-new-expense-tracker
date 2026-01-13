import { createSignal, Show } from 'solid-js';
import { useSubmission } from '@solidjs/router';
import { action } from '@solidjs/router';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';
import { redirect } from '@solidjs/router';

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
        const [newDestination] = await db
            .insert(Destination)
            .values({
                name,
                is_warehouse: isWarehouse,
            })
            .returning();

        throw redirect(`/destination/${newDestination.id}`);
    } catch (e: any) {
        // If it's a redirect, let it pass through
        if (e instanceof Response) throw e;

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
                    <h1 class="text-xl font-medium text-white tracking-tight">New Site/Godown</h1>
                    <p class="text-zinc-500 text-sm mt-1">Add a location to your network.</p>
                </div>

                <form action={createDestination} method="post" class="space-y-4">
                    <div class="group relative bg-zinc-900/40 border border-zinc-800 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 rounded-xl transition-all duration-200">
                        <label
                            for="name"
                            class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 select-none group-focus-within:text-zinc-400 transition-colors"
                        >
                            Destination Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            required
                            placeholder="e.g. Pune Central Hub"
                            class="w-full bg-transparent text-white text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-700 transition-colors"
                        />
                    </div>

                    {/* Warehouse Toggle */}
                    <div
                        class="flex items-center justify-between px-3.5 py-3 bg-zinc-900/40 border border-zinc-800 rounded-xl cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/60 transition-all group"
                        onClick={() => setIsWarehouse(!isWarehouse())}
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium text-zinc-300 group-hover:text-zinc-200 transition-colors">
                                Is this a godown?
                            </span>
                        </div>

                        <input type="checkbox" name="is_warehouse" checked={isWarehouse()} class="hidden" />

                        {/* Switch UI */}
                        <div
                            class={`relative w-9 h-5 rounded-full transition-colors duration-200 ${isWarehouse() ? 'bg-zinc-100' : 'bg-zinc-800'}`}
                        >
                            <div
                                class={`absolute top-1 left-1 w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${isWarehouse() ? 'translate-x-4 bg-black' : 'translate-x-0 bg-zinc-500'}`}
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
                        class="w-full bg-white hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-xl py-3 transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    >
                        {submission.pending ? 'Creating...' : 'Create'}
                    </button>
                </form>
            </div>
        </div>
    );
}
