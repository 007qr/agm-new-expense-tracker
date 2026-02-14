import { type APIEvent } from '@solidjs/start/server';
import { eq, and, gte, lte, or, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '~/drizzle/client';
import { Transaction, Entity, Destination, TransportationCost, EntityVariant } from '~/drizzle/schema';

export async function GET(event: APIEvent) {
	const dest = event.params.id;
	const url = new URL(event.request.url);
	const filter = url.searchParams.get('filter') ?? 'all';
	const dateRangeParam = url.searchParams.get('dateRange');
	const dateRange = dateRangeParam && dateRangeParam !== 'null' ? JSON.parse(dateRangeParam) : null;

	let dateFilter;
	if (filter === '7days') {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		dateFilter = gte(Transaction.created_at, sevenDaysAgo);
	} else if (filter === '30days') {
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		dateFilter = gte(Transaction.created_at, thirtyDaysAgo);
	} else if (filter === 'custom' && dateRange) {
		dateFilter = and(
			gte(Transaction.created_at, new Date(dateRange.from + 'T00:00:00')),
			lte(Transaction.created_at, new Date(dateRange.to + 'T23:59:59')),
		);
	}

	const baseFilter = or(eq(Transaction.destination_id, dest), eq(Transaction.source_id, dest));
	const filters = and(baseFilter, dateFilter);

	const evAlias = alias(EntityVariant, 'ev');
	const sourceAlias = alias(Destination, 'source');
	const destinationAlias = alias(Destination, 'destination');

	const variantDetails = sql<string>`
		NULLIF(
			TRIM(
				COALESCE(
					NULLIF(CONCAT_WS(' x ',
						(CASE WHEN ${evAlias.length} IS NOT NULL AND ${evAlias.length}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.length}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END),
						(CASE WHEN ${evAlias.width} IS NOT NULL AND ${evAlias.width}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.width}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END),
						(CASE WHEN ${evAlias.height} IS NOT NULL AND ${evAlias.height}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.height}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.dimension_unit}, '')) ELSE NULL END)
					), ''),
					''
				)
				||
				(CASE
					WHEN
						NULLIF(CONCAT_WS(' x ',
							(CASE WHEN ${evAlias.length} IS NOT NULL AND ${evAlias.length}::numeric > 0 THEN 'L' END),
							(CASE WHEN ${evAlias.width} IS NOT NULL AND ${evAlias.width}::numeric > 0 THEN 'W' END),
							(CASE WHEN ${evAlias.height} IS NOT NULL AND ${evAlias.height}::numeric > 0 THEN 'H' END)
						), '') IS NOT NULL
						AND
						(${evAlias.thickness} IS NOT NULL AND ${evAlias.thickness}::numeric > 0)
					THEN ' thickness '
					ELSE ''
				END)
				||
				COALESCE(
					NULLIF(
						(CASE WHEN ${evAlias.thickness} IS NOT NULL AND ${evAlias.thickness}::numeric > 0 THEN TRIM(COALESCE(ROUND(${evAlias.thickness}::numeric, 2)::text, '') || ' ' || COALESCE(${evAlias.thickness_unit}, '')) ELSE NULL END),
					''),
					''
				)
			),
		'')
	`;

	const results = await db
		.select({
			created_at: Transaction.created_at,
			entity_name: Entity.name,
			entity_variant: variantDetails,
			source_name: sourceAlias.name,
			destination_name: destinationAlias.name,
			rate: Transaction.rate,
			quantity: Transaction.quantity,
			unit: Entity.unit,
			amount: Transaction.amount,
			payment_status: Transaction.payment_status,
			vehicle_type: TransportationCost.vehicle_type,
			reg_no: TransportationCost.reg_no,
			transportation_cost: TransportationCost.cost,
			source_id: Transaction.source_id,
			destination_id: Transaction.destination_id,
		})
		.from(Transaction)
		.leftJoin(Entity, eq(Transaction.entity_id, Entity.id))
		.leftJoin(evAlias, eq(Transaction.entity_variant_id, evAlias.id))
		.leftJoin(sourceAlias, eq(Transaction.source_id, sourceAlias.id))
		.leftJoin(destinationAlias, eq(Transaction.destination_id, destinationAlias.id))
		.leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
		.where(filters)
		.orderBy(desc(Transaction.created_at));

	const escapeCSV = (value: string | null | undefined): string => {
		if (!value) return '';
		const str = String(value);
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const headers = [
		'Date', 'Type', 'Item', 'Variant', 'From/To',
		'Rate (₹)', 'Quantity', 'Unit', 'Amount (₹)',
		'Payment Status', 'Vehicle Type', 'Reg. No.', 'Transport Cost (₹)'
	];

	const dataRows = results.map(row => {
		const type = row.destination_id === dest ? 'Inward' : 'Outward';
		const fromTo = row.destination_id === dest ? row.source_name : row.destination_name;

		return [
			new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
			type,
			escapeCSV(row.entity_name ?? ''),
			escapeCSV(row.entity_variant ?? '--'),
			escapeCSV(fromTo ?? ''),
			Number(row.rate ?? 0).toFixed(2),
			Number(row.quantity ?? 0).toFixed(2),
			row.unit ?? '',
			Number(row.amount ?? 0).toFixed(2),
			row.payment_status ?? '',
			row.vehicle_type ?? '--',
			row.reg_no ?? '--',
			row.transportation_cost ? Number(row.transportation_cost).toFixed(2) : '--',
		].join(',');
	});

	// Total: SUM(amount + transportation_cost) for inward transactions only (same as ledger page)
	let total = 0;
	for (const row of results) {
		if (row.destination_id === dest) {
			total += Number(row.amount ?? 0) + Number(row.transportation_cost ?? 0);
		}
	}

	const emptyRow = Array(headers.length).fill('').join(',');
	const totalRow = ['Total', '', '', '', '', '', '', '', total.toFixed(2), '', '', '', ''].join(',');

	const csvRows = [
		headers.join(','),
		...dataRows,
		emptyRow,
		totalRow,
	];

	const csv = csvRows.join('\n');
	const filename = `expense-ledger-${dest}-${new Date().toISOString().split('T')[0]}.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}
