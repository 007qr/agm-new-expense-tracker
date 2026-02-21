import { createSignal, createMemo, createEffect, Show, For, type Component } from 'solid-js';
import { useAction, useSubmission } from '@solidjs/router';
import Dialog from '@corvu/dialog';
import { createExpense } from '~/routes/expenses/new/index';
import { QuickEntryParser, type MatchableItem, type Variant } from '~/lib/quick-entry-parser';

export type QuickEntryFormData = {
    entities: { id: string; name: string; unit: string | null }[];
    destinations: { id: string; name: string }[];
    variants: Variant[];
};

type QuickEntryDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    formData: QuickEntryFormData;
};

const FORMAT_EXAMPLE = '30 cement @100 debit from site A';
const FORMAT_FULL = '50 steel 10x20 @250 credit from depot carting @200 truck MH12AB1234 pending';

const QuickEntryDialog: Component<QuickEntryDialogProps> = (props) => {
    const submit = useAction(createExpense);
    const submission = useSubmission(createExpense);

    const parser = new QuickEntryParser();

    const [input, setInput] = createSignal('');
    let inputRef: HTMLTextAreaElement | undefined;

    // Sync parser data whenever formData prop changes
    createEffect(() => {
        parser.setEntities(props.formData.entities);
        parser.setDestinations(props.formData.destinations);
        parser.setVariants(props.formData.variants);
    });

    createEffect(() => {
        if (!props.open) {
            setInput('');
        } else {
            setTimeout(() => inputRef?.focus(), 100);
        }
    });

    const parsed = createMemo(() => parser.parse(input()));

    const amount = createMemo(() => {
        const p = parsed();
        return p.quantity !== null && p.rate !== null ? p.quantity * p.rate : 0;
    });

    const hasParsedAnything = createMemo(() => {
        const p = parsed();
        return p.quantity !== null || p.entity.raw !== '';
    });

    // Determine which unmatched field to show suggestions for (first one wins)
    const activeSuggestions = createMemo((): { label: string; field: 'entity' | 'source'; items: MatchableItem[] } | null => {
        const p = parsed();
        if (p.entity.raw && !p.entity.match && p.entity.suggestions.length > 0) {
            return { label: 'Items', field: 'entity', items: p.entity.suggestions };
        }
        if (p.source.raw && !p.source.match && p.source.suggestions.length > 0) {
            return { label: 'Sources', field: 'source', items: p.source.suggestions };
        }
        return null;
    });

    const applySuggestion = (name: string) => {
        const ctx = activeSuggestions();
        if (!ctx) return;

        const current = input();
        let updated = current;

        if (ctx.field === 'entity') {
            // Replace entity text between qty and @rate
            const p = parsed();
            const raw = p.entity.raw;
            if (raw) {
                // Find where the entity text lives in the input
                const qtyMatch = current.match(/^(\d+(?:\.\d+)?)\s+/);
                if (qtyMatch) {
                    const afterQty = current.slice(qtyMatch[0].length);
                    const entityEnd = afterQty.indexOf(raw) + raw.length;
                    updated = qtyMatch[0] + name + afterQty.slice(entityEnd);
                }
            }
        } else if (ctx.field === 'source') {
            updated = replaceSegment(current, 'from', 'carting', name);
        }

        setInput(updated);
        inputRef?.focus();
    };

    const handleSubmit = () => {
        const p = parsed();
        if (!p.complete) return;
        submit(parser.toFormData(p));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && parsed().complete) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
                <Dialog.Content class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div class="flex items-center justify-between mb-4">
                        <Dialog.Label class="text-lg font-semibold text-black">Quick Entry</Dialog.Label>
                        <Dialog.Close class="text-zinc-400 hover:text-black transition-colors rounded-lg p-1 hover:bg-zinc-100">
                            <IconX />
                        </Dialog.Close>
                    </div>

                    {/* Format guide */}
                    <FormatGuide />

                    {/* Input */}
                    <textarea
                        ref={inputRef}
                        value={input()}
                        onInput={(e) => setInput(e.currentTarget.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={FORMAT_EXAMPLE}
                        class="w-full bg-white border border-zinc-200 focus:border-black/40 focus:ring-1 focus:ring-black/10 rounded-xl text-black text-sm px-4 py-3 outline-none resize-none transition-all font-mono"
                        rows={2}
                    />

                    {/* Suggestions */}
                    <Show when={activeSuggestions()}>
                        {(ctx) => (
                            <div class="mt-2 animate-in fade-in duration-150">
                                <p class="text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1.5">
                                    Did you mean ({ctx().label})
                                </p>
                                <div class="flex flex-wrap gap-1.5">
                                    <For each={ctx().items}>
                                        {(item) => (
                                            <button
                                                type="button"
                                                onClick={() => applySuggestion(item.name)}
                                                class="px-2.5 py-1 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors"
                                            >
                                                {item.name}
                                                <Show when={item.unit}>
                                                    <span class="text-zinc-400 ml-1">({item.unit})</span>
                                                </Show>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </div>
                        )}
                    </Show>

                    {/* Parsed preview */}
                    <Show when={hasParsedAnything()}>
                        <div class="mt-4 animate-in fade-in duration-200">
                            <p class="text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-2">Parsed</p>
                            <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                                <Show when={parsed().entity.raw}>
                                    <Field label="Item" value={parsed().entity.match?.name ?? parsed().entity.raw} ok={!!parsed().entity.match} />
                                </Show>
                                <Show when={parsed().variant.raw}>
                                    <Field label="Variant" value={parsed().variant.raw} ok={!!parsed().variant.match} />
                                </Show>
                                <Show when={parsed().quantity !== null}>
                                    <Field label="Qty" value={String(parsed().quantity)} ok />
                                </Show>
                                <Show when={parsed().rate !== null}>
                                    <Field label="Rate" value={fmtCurrency(parsed().rate!)} ok />
                                </Show>
                                <Show when={parsed().rate !== null && parsed().quantity !== null}>
                                    <Field label="Total" value={fmtCurrency(amount())} ok bold />
                                </Show>
                                <Field label="Type" value={parsed().transactionType} ok capitalize />
                                <Show when={parsed().source.raw}>
                                    <Field label="From" value={parsed().source.match?.name ?? parsed().source.raw} ok={!!parsed().source.match} />
                                </Show>
                                <Show when={parsed().transportCost !== null}>
                                    <Field label="Carting" value={fmtCurrency(parsed().transportCost!)} ok />
                                </Show>
                                <Show when={parsed().vehicleType}>
                                    <Field label="Vehicle" value={parsed().vehicleType} ok />
                                </Show>
                                <Show when={parsed().regNo}>
                                    <Field label="Reg No" value={parsed().regNo} ok />
                                </Show>
                                <Field label="Status" value={parsed().paymentStatus} ok capitalize />
                            </div>
                        </div>
                    </Show>

                    {/* Errors */}
                    <Show when={parsed().errors.length > 0}>
                        <div class="mt-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg space-y-0.5">
                            <For each={parsed().errors}>
                                {(err) => <p class="text-xs text-red-500">{err}</p>}
                            </For>
                        </div>
                    </Show>

                    {/* Submission error */}
                    <Show when={submission.result?.error}>
                        <div class="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 font-medium">
                            {submission.result?.error}
                        </div>
                    </Show>

                    {/* Submit */}
                    <button
                        type="button"
                        disabled={!parsed().complete || submission.pending}
                        onClick={handleSubmit}
                        class="mt-4 w-full bg-black hover:bg-black/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3.5 transition-all"
                    >
                        {submission.pending ? 'Saving...' : 'Save Expense'}
                    </button>

                    <p class="mt-2 text-center text-[11px] text-zinc-400">
                        <kbd class="px-1.5 py-0.5 bg-zinc-100 rounded text-[10px] font-mono">Ctrl+Enter</kbd> to submit
                    </p>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
};

// ── Helpers ────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

/**
 * Replace the text between two keyword boundaries in the input string.
 * e.g. replaceSegment("30 cement @100 from old to dest", "from", "to", "new source")
 *   → "30 cement @100 from new source to dest"
 */
function replaceSegment(input: string, startKw: string, endKw: string, replacement: string): string {
    const startRe = new RegExp(`\\b${startKw}\\s+`, 'i');
    const sm = input.match(startRe);
    if (!sm) return input;

    const afterStart = sm.index! + sm[0].length;
    const endRe = new RegExp(`\\s+\\b${endKw}\\b`, 'i');
    const em = input.slice(afterStart).match(endRe);

    if (em) {
        return input.slice(0, afterStart) + replacement + input.slice(afterStart + em.index!);
    }
    // No end keyword — replace till end of string
    return input.slice(0, afterStart) + replacement;
}

// ── Small components ───────────────────────────────────────────────

function Field(props: { label: string; value: string; ok: boolean; bold?: boolean; capitalize?: boolean }) {
    return (
        <div class="flex justify-between">
            <span class="text-zinc-500">{props.label}</span>
            <span
                classList={{
                    'font-medium': !props.bold,
                    'font-bold': props.bold,
                    'text-black': props.ok,
                    'text-red-500': !props.ok,
                    'capitalize': props.capitalize,
                }}
            >
                {props.value}
                <Show when={!props.ok}>
                    <span class="text-[10px] ml-1">?</span>
                </Show>
            </span>
        </div>
    );
}

function FormatGuide() {
    return (
        <div class="mb-4 px-3 py-2.5 bg-zinc-50 rounded-lg border border-zinc-100 space-y-1.5">
            <p class="text-[11px] font-mono leading-relaxed">
                <C c="black">{'{qty}'}</C>{' '}
                <C c="blue-600">{'{item}'}</C>{' '}
                <C c="violet-500">{'{variant?}'}</C>{' '}
                <C c="zinc-400">@</C>
                <C c="black">{'{rate}'}</C>{' '}
                <C c="purple-600">credit|debit</C>{' '}
                <C c="zinc-400">from</C>{' '}
                <C c="emerald-600">{'{source}'}</C>{' '}
                <C c="zinc-400">carting</C>{' '}
                <C c="zinc-400">@</C>
                <C c="amber-600">{'{cost}'}</C>{' '}
                <C c="amber-600">{'{vehicle}'}</C>{' '}
                <C c="amber-600">{'{reg}'}</C>{' '}
                <C c="purple-600">{'{status}'}</C>
            </p>
            <p class="text-[10px] text-zinc-400">
                e.g. <span class="text-zinc-600">{FORMAT_FULL}</span>
            </p>
        </div>
    );
}

/** Tiny colored span for the format guide */
function C(props: { c: string; children: string }) {
    return <span class={`text-${props.c} font-semibold`}>{props.children}</span>;
}

function IconX() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

export default QuickEntryDialog;
