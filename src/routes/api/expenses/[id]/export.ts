import { type APIEvent } from '@solidjs/start/server';
import { eq, and, getViewSelectedFields, gte, lte, asc } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { TransactionDetail } from '~/drizzle/schema';
import { auth } from '~/lib/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCSV(value: string | null | undefined): string {
	if (value == null) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** Format a number, trimming redundant trailing zeros: 1.00 → "1", 1.50 → "1.5" */
function fmtNum(n: number): string {
	return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Format a Date as dd-mm-yyyy (for display labels) */
function fmtDateLabel(d: Date): string {
	const dd   = String(d.getDate()).padStart(2, '0');
	const mm   = String(d.getMonth() + 1).padStart(2, '0');
	const yyyy = d.getFullYear();
	return `${dd}-${mm}-${yyyy}`;
}

/** Format a Date as yyyy-mm-dd (for sorting keys) */
function toDateKey(d: Date): string {
	const yyyy = d.getFullYear();
	const mm   = String(d.getMonth() + 1).padStart(2, '0');
	const dd   = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

/** Return the Monday (local time) of the week containing `d` */
function weekMonday(d: Date): Date {
	const day  = d.getDay(); // 0=Sun … 6=Sat
	const diff = day === 0 ? -6 : 1 - day;
	const mon  = new Date(d);
	mon.setDate(d.getDate() + diff);
	mon.setHours(0, 0, 0, 0);
	return mon;
}

/** Format a week range as "dd-mm to dd-mm (yyyy)" */
function fmtWeekLabel(mon: Date): string {
	const sun = new Date(mon);
	sun.setDate(mon.getDate() + 6);
	const short = (dt: Date) =>
		`${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
	return `${short(mon)} to ${short(sun)} (${mon.getFullYear()})`;
}

/** Build the column header for a transaction row */
function colKey(entityName: string | null, entityVariant: string | null): string {
	const name    = entityName ?? 'Unknown';
	const variant = entityVariant?.trim();
	return variant ? `${name} (${variant})` : name;
}

// ---------------------------------------------------------------------------
// Pivot-table CSV builder
// ---------------------------------------------------------------------------

type TxRow = {
	created_at:     Date | null;
	entity_name:    string | null;
	entity_variant: string | null;
	quantity:       string | null;
	rate:           string | null;
	amount:         string | null;
};

function buildPivotCSV(rows: TxRow[], groupBy: 'date' | 'week'): string {
	// 1. Collect unique column keys, sorted alphabetically
	const colSet = new Set<string>();
	for (const r of rows) colSet.add(colKey(r.entity_name, r.entity_variant));
	const cols = [...colSet].sort();

	const firstCol = groupBy === 'date' ? 'Date' : 'Week';

	if (rows.length === 0 || cols.length === 0) {
		// Return a valid, empty CSV
		return [firstCol, ...cols].join(',') + '\n';
	}

	// 2. Header
	const header = [firstCol, ...cols.map(escapeCSV)].join(',');

	// 3. Group rows by sort key (yyyy-mm-dd for dates, ISO Monday for weeks)
	const groupMap   = new Map<string, TxRow[]>();
	const labelMap   = new Map<string, string>();  // sortKey → display label

	for (const r of rows) {
		if (!r.created_at) continue;
		const d = new Date(r.created_at);

		let sortKey: string;
		let label: string;

		if (groupBy === 'date') {
			sortKey = toDateKey(d);
			label   = fmtDateLabel(d);
		} else {
			const mon = weekMonday(d);
			sortKey   = toDateKey(mon);           // yyyy-mm-dd of Monday → sorts correctly
			label     = fmtWeekLabel(mon);
		}

		if (!groupMap.has(sortKey)) {
			groupMap.set(sortKey, []);
			labelMap.set(sortKey, label);
		}
		groupMap.get(sortKey)!.push(r);
	}

	// Sort chronologically (yyyy-mm-dd strings sort correctly)
	const sortedKeys = [...groupMap.keys()].sort();

	// Accumulators for footer rows
	const latestRate  = new Map<string, number>(); // last-seen rate per col
	const totalAmount = new Map<string, number>(); // sum of amounts per col
	cols.forEach(c => totalAmount.set(c, 0));

	// 4. Data rows
	const dataRows: string[] = [];
	for (const key of sortedKeys) {
		const groupRows = groupMap.get(key)!;
		const label     = labelMap.get(key)!;

		// Sum quantities per column within this group
		const qtyMap = new Map<string, number>();
		for (const r of groupRows) {
			const col = colKey(r.entity_name, r.entity_variant);
			qtyMap.set(col, (qtyMap.get(col) ?? 0) + Number(r.quantity ?? 0));
			if (r.rate  != null) latestRate.set(col, Number(r.rate));
			totalAmount.set(col, (totalAmount.get(col) ?? 0) + Number(r.amount ?? 0));
		}

		const cells = cols.map(c => fmtNum(qtyMap.get(c) ?? 0));
		dataRows.push([escapeCSV(label), ...cells].join(','));
	}

	// 5. Footer rows
	const rateRow = [
		'Latest Rate (Rs)',
		...cols.map(c => fmtNum(latestRate.get(c) ?? 0)),
	].join(',');

	const amtRow = [
		'Total Amount (Rs)',
		...cols.map(c => fmtNum(totalAmount.get(c) ?? 0)),
	].join(',');

	const grandTotal = [...totalAmount.values()].reduce((a, b) => a + b, 0);
	const grandRow = [
		'Grand Total (Rs)',
		fmtNum(grandTotal),
		...Array(cols.length - 1).fill(''),
	].join(',');

	return [header, ...dataRows, rateRow, amtRow, grandRow].join('\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(event: APIEvent) {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) return new Response('Unauthorized', { status: 401 });
	const role = session.user.role as string;
	if (role !== 'admin' && role !== 'expense-user') return new Response('Forbidden', { status: 403 });

	const dest      = event.params.id;
	const url       = new URL(event.request.url);
	const format    = url.searchParams.get('format') ?? 'simple'; // 'simple' | 'weekly'
	const fromParam = url.searchParams.get('from');
	const toParam   = url.searchParams.get('to');

	if (!fromParam || !toParam) {
		return new Response('Missing required query params: from and to (YYYY-MM-DD)', { status: 400 });
	}

	// Parse dates as local midnight / end-of-day (consistent with the ledger's date filter)
	const dateFrom = new Date(fromParam + 'T00:00:00');
	const dateTo   = new Date(toParam   + 'T23:59:59');

	if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
		return new Response('Invalid date format. Use YYYY-MM-DD.', { status: 400 });
	}

	const conditions: Parameters<typeof and>[0][] = [
		eq(TransactionDetail.source_id, dest),
		gte(TransactionDetail.created_at, dateFrom),
		lte(TransactionDetail.created_at, dateTo),
	];

	// Weekly report = pending transactions only
	if (format === 'weekly') {
		conditions.push(eq(TransactionDetail.payment_status, 'pending'));
	}

	const results = await db
		.select(getViewSelectedFields(TransactionDetail))
		.from(TransactionDetail)
		.where(and(...conditions))
		.orderBy(asc(TransactionDetail.created_at));

	const csv = buildPivotCSV(results, format === 'weekly' ? 'week' : 'date');

	const filename = format === 'weekly'
		? `weekly-report-${fromParam}-to-${toParam}.csv`
		: `expenses-${fromParam}-to-${toParam}.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}
