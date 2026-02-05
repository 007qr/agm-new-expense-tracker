import { createAsync, query, useLocation, useParams, createResource } from '@solidjs/router';
import { createSignal, Show, Suspense } from 'solid-js';
import { db } from '~/drizzle/client';
import { Destination } from '~/drizzle/schema';
import ExpenseLedgerTable from '~/components/ExpenseLedgerTable';
import { loadTotalAmount } from './totalAmount';
import { eq } from 'drizzle-orm';

// This query is now only for the destination name, as the table data is fetched in the component
export const loadDestinationInfo = query(async (dest: string) => {
    'use server';
    const destination = await db
        .select({ name: Destination.name })
        .from(Destination)
        .where(eq(Destination.id, dest))
        .then((rows) => rows[0]);
    return {
        destination: destination?.name ?? 'Unknown',
    };
}, 'destination-info-for-ledger');

export default function ExpenseLedgerPage() {
    const params = useParams<{ id: string }>();
    const location = useLocation();
    const entityFilter = () => new URLSearchParams(location.search).get('entity') ?? '';
    
    // Simpler data loading for the page shell
    const destinationInfo = createAsync(() => loadDestinationInfo(params.id));

    // On-demand total amount logic remains here
    const [showTotal, setShowTotal] = createSignal(false);
    const [triggerFetch, setTriggerFetch] = createSignal(false);
    const [totalAmount] = createResource(
        () => (triggerFetch() ? params.id : null),
        (id) => loadTotalAmount(id)
    );

    return (
        <div class="w-full mx-auto px-4 py-12">
            <div class="mb-8 flex justify-between items-start">
                <div>
                    <h1 class="text-3xl font-bold text-black tracking-tight">Expense Ledger</h1>
                    <Suspense fallback={<span class="block w-32 h-4 bg-zinc-200 rounded-md animate-pulse" />}>
                        <p class="text-base text-zinc-600">
                            For site: <span class="font-medium text-zinc-900">{destinationInfo()?.destination}</span>
                        </p>
                    </Suspense>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold text-black">Total Amount</p>
                    <Show
                        when={showTotal()}
                        fallback={
                            <button
                                onClick={() => { setShowTotal(true); setTriggerFetch(true); }}
                                class="text-blue-600 hover:underline"
                                disabled={totalAmount.loading}
                            >
                                {totalAmount.loading ? 'Loading...' : 'Show Total'}
                            </button>
                        }
                    >
                        <span class="text-2xl font-bold text-black" classList={{ 'blur-sm': totalAmount.loading }}>
                            ₹{Number(totalAmount() ?? 0).toFixed(2)}
                        </span>
                    </Show>
                </div>
            </div>

            <ExpenseLedgerTable destinationId={params.id} entityFilter={entityFilter()} />
        </div>
    );
}
