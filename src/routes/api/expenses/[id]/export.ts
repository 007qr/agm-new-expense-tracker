import { type APIEvent } from '@solidjs/start/server';
import { eq, and, getViewSelectedFields, gte, lte, or, desc } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { TransactionDetail } from '~/drizzle/schema';
import { auth } from '~/lib/auth';

export async function GET(event: APIEvent) {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	const role = session.user.role as string;
	if (role !== 'admin' && role !== 'expense-user') {
		return new Response('Forbidden', { status: 403 });
	}

	const dest = event.params.id;
	const url = new URL(event.request.url);
	const filter = url.searchParams.get('filter') ?? 'all';
	const dateRangeParam = url.searchParams.get('dateRange');
	const dateRange = dateRangeParam && dateRangeParam !== 'null' ? JSON.parse(dateRangeParam) : null;

	const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
	const dateFilter =
		filter === '7days'  ? gte(TransactionDetail.created_at, daysAgo(7)) :
		filter === '30days' ? gte(TransactionDetail.created_at, daysAgo(30)) :
		filter === 'custom' && dateRange ? and(
			gte(TransactionDetail.created_at, new Date(dateRange.from + 'T00:00:00')),
			lte(TransactionDetail.created_at, new Date(dateRange.to + 'T23:59:59')),
		) : undefined;

	const results = await db
		.select(getViewSelectedFields(TransactionDetail))
		.from(TransactionDetail)
		.where(and(
			or(eq(TransactionDetail.destination_id, dest), eq(TransactionDetail.source_id, dest)),
			dateFilter,
		))
		.orderBy(desc(TransactionDetail.created_at));

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
			row.entity_unit ?? '',
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
