import { query, createAsync, useNavigate, useParams, A } from '@solidjs/router';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Destination, EntityVariantWarehouse, EntityWarehouse, WarehouseTransaction } from '~/drizzle/schema';
import { createEffect, createSignal, For, Show, Suspense } from 'solid-js';
import { Pagination, PaginationSkeleton } from '~/components/Pagination';

export const loadEntitiesForDestination = query(async (dest: string, limit: number, offset: number) => {
    'use server';

    // 1. Define the formatted string logic
    const variantDetails = sql<string>`
        NULLIF(
            TRIM(
                COALESCE(
                    NULLIF(CONCAT_WS(' x ',
                        (CASE WHEN ${EntityVariantWarehouse.length} IS NOT NULL AND ${EntityVariantWarehouse.length}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.length}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END),
                        (CASE WHEN ${EntityVariantWarehouse.width} IS NOT NULL AND ${EntityVariantWarehouse.width}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.width}::text, '')  || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END),
                        (CASE WHEN ${EntityVariantWarehouse.height} IS NOT NULL AND ${EntityVariantWarehouse.height}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.height}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.dimension_unit}, '')) ELSE NULL END)
                    ), ''),
                    ''
                )
                ||
                (CASE
                    WHEN
                        NULLIF(CONCAT_WS(' x ',
                            (CASE WHEN ${EntityVariantWarehouse.length} IS NOT NULL AND ${EntityVariantWarehouse.length}::numeric > 0 THEN 'L' END),
                            (CASE WHEN ${EntityVariantWarehouse.width} IS NOT NULL AND ${EntityVariantWarehouse.width}::numeric > 0 THEN 'W' END),
                            (CASE WHEN ${EntityVariantWarehouse.height} IS NOT NULL AND ${EntityVariantWarehouse.height}::numeric > 0 THEN 'H' END)
                        ), '') IS NOT NULL
                        AND
                        (${EntityVariantWarehouse.thickness} IS NOT NULL AND ${EntityVariantWarehouse.thickness}::numeric > 0)
                    THEN ' thickness '
                    ELSE ''
                END)
                ||
                COALESCE(
                    NULLIF(
                        (CASE WHEN ${EntityVariantWarehouse.thickness} IS NOT NULL AND ${EntityVariantWarehouse.thickness}::numeric > 0 THEN TRIM(COALESCE(${EntityVariantWarehouse.thickness}::text, '') || ' ' || COALESCE(${EntityVariantWarehouse.thickness_unit}, '')) ELSE NULL END),
                    ''),
                    ''
                )
            ),
        '')
    `;

    // 2. Perform the heavy aggregation on IDs ONLY (Fastest operation)
    const sq = db.$with('sq').as(
        db
            .select({
                entity_id: WarehouseTransaction.entity_id,
                entity_variant_id: WarehouseTransaction.entity_variant_id,
                net_quantity: sql<number>`SUM(
                CASE
                    WHEN ${WarehouseTransaction.destination_id} = ${dest}
                    THEN COALESCE(CAST(${WarehouseTransaction.quantity} as REAL), 0)
                    WHEN ${WarehouseTransaction.source_id} = ${dest}
                    THEN -COALESCE(CAST(${WarehouseTransaction.quantity} as REAL), 0)
                    ELSE 0
                END)`.as('net_quantity'),
            })
            .from(WarehouseTransaction)
            .where(or(eq(WarehouseTransaction.destination_id, dest), eq(WarehouseTransaction.source_id, dest)))
            .groupBy(WarehouseTransaction.entity_id, WarehouseTransaction.entity_variant_id),
    );

    // 3. Join the lightweight result to the heavy tables
    const rows = await db
        .with(sq)
        .select({
            entity_id: sq.entity_id,
            entity_variant_id: sq.entity_variant_id,
            net_quantity: sq.net_quantity,
            entity_name: EntityWarehouse.name,
            variant_formatted: variantDetails,
        })
        .from(sq)
        .leftJoin(EntityWarehouse, eq(sq.entity_id, EntityWarehouse.id))
        .leftJoin(EntityVariantWarehouse, eq(sq.entity_variant_id, EntityVariantWarehouse.id))
        .limit(limit)
        .offset(offset);
    // Optional: Filter out zero quantities to keep the UI clean
    // .where(sql`${sq.net_quantity} != 0`);

    const totalCount = await db
        .with(sq)
        .select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(sq)
        .then((rows) => rows[0]?.total ?? 0);

    // Get the name of the destination
    const destination = db.select({ name: Destination.name }).from(Destination).where(eq(Destination.id, dest));

    return {
        entities: rows,
        destination: await destination.then((dest) => dest[0]?.name ?? 'Unknown'),
        totalCount,
    };
}, 'all-entities-for-destination');

export default function DestinationPage() {
    const params = useParams<{ id: string }>();
    const [page, setPage] = createSignal(1);
    const [pageSize, setPageSize] = createSignal(10);
    const inventory = createAsync(() => loadEntitiesForDestination(params.id, pageSize(), (page() - 1) * pageSize()));
    const navigate = useNavigate();
    const totalCount = () => inventory()?.totalCount ?? 0;

    const formatVariantLabel = (value?: string | null) => {
        if (!value) return 'NA';
        return value.replace(/\d+(?:\.\d+)?/g, (match) => {
            const num = Number.parseFloat(match);
            if (!Number.isFinite(num)) return match;
            return num.toFixed(3).replace(/\.?0+$/, '');
        });
    };

    return (
        <div class="w-full mx-auto px-4 py-12">
            {/* Header Section */}
            <div class="mb-8 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-black tracking-tight">Inventory Status</h1>
                    <p class="text-zinc-600 mt-2 text-base">
                        Current stock levels for Destination{' '}
                        <Suspense
                            fallback={
                                <span class="w-20 bg-zinc-200 h-4 inline-block rounded-md align-middle animate-pulse"></span>
                            }
                        >
                            <span class="font-mono text-zinc-700 underline">{inventory()?.destination}</span>
                        </Suspense>
                    </p>
                </div>
                <div class="flex items-center gap-4">
                    <A class="bg-secondary text-brand py-2.5 px-2 rounded-lg" href={`ledger`}>
                        Open Ledger
                    </A>
                    <A
                        class="bg-secondary text-brand py-2.5 px-2 rounded-lg"
                        href={`/destination/${params.id}/transaction/new`}
                    >
                        New Transaction
                    </A>
                </div>
            </div>

            {/* Main Surface Card */}
            <div class="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl shadow-black/5">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-zinc-200">
                                <th class="py-5 pl-8 pr-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Item
                                </th>
                                <th class="py-5 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Dimension
                                </th>
                                <th class="py-5 pl-4 pr-8 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Net Quantity
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-200">
                            <Suspense fallback={<TableSkeleton />}>
                                <Show when={totalCount() > 0} fallback={<EmptyState />}>
                                    <For each={inventory()?.entities}>
                                        {(item) => (
                                            <tr
                                                class="group cursor-pointer hover:bg-zinc-50 transition-colors duration-200"
                                                role="link"
                                                tabindex={0}
                                                onClick={() => navigate(`ledger?entity=${item.entity_id}`)}
                                            >
                                                {/* Entity Name & ID Column */}
                                                <td class="py-5 pl-8 pr-4">
                                                    <div class="flex flex-col">
                                                        <span class="font-medium text-black text-sm">
                                                            {item.entity_name}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Variant Details Column */}
                                                <td class="py-5 px-4">
                                                    <div class="flex flex-col">
                                                        {/* Show formatted string if it exists, else fallback */}
                                                        <span class="text-sm text-zinc-700">
                                                            {formatVariantLabel(item.variant_formatted)}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Quantity Column */}
                                                <td class="py-5 pl-4 pr-8 text-right">
                                                    <span
                                                        class={`text-sm font-medium ${
                                                            (item.net_quantity ?? 0) < 0 ? 'text-red-500' : 'text-black'
                                                        }`}
                                                    >
                                                        {item.net_quantity?.toLocaleString() ?? 0}
                                                    </span>
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
        </div>
    );
}

// --- Sub Components ---

const EmptyState = () => (
    <tr>
        <td colspan={3} class="py-16 text-center">
            <div class="flex flex-col items-center justify-center gap-3">
                <div class="p-3 bg-zinc-900 rounded-full border border-zinc-800">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 text-zinc-500"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                        />
                    </svg>
                </div>
                <p class="text-zinc-500 text-sm font-medium">No inventory records found</p>
            </div>
        </td>
    </tr>
);

const TableSkeleton = () => (
    <For each={[1, 2, 3, 4, 5]}>
        {() => (
            <tr class="animate-pulse">
                <td class="py-5 pl-8 pr-4">
                    <div class="h-4 w-32 bg-zinc-800/50 rounded"></div>
                </td>
                <td class="py-5 px-4">
                    <div class="h-6 w-24 bg-zinc-800/50 rounded-md"></div>
                </td>
                <td class="py-5 pl-4 pr-8 text-right flex justify-end">
                    <div class="h-4 w-12 bg-zinc-800/50 rounded"></div>
                </td>
            </tr>
        )}
    </For>
);
