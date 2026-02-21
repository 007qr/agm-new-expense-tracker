import { type APIEvent } from '@solidjs/start/server';
import { eq, and, getViewSelectedFields, gte, lte, asc } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { TransactionDetail } from '~/drizzle/schema';
import { auth } from '~/lib/auth';

function escapeCSV(value: string | null | undefined): string {
	if (value == null) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** Format a number without unnecessary trailing zeros: 1.00 → "1", 1.50 → "1.5" */
function fmtNum(n: number): string {
	return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Format a UTC date as dd-mm-yyyy */
function fmtDate(d: Date): string {
	const dd   = String(d.getUTCDate()).padStart(2, '0');
	const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
	const yyyy = d.getUTCFullYear();
	return `${dd}-${mm}-${yyyy}`;
}

export async function GET(event: APIEvent) {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (!session?.user) return new Response('Unauthorized', { status: 401 });
	const role = session.user.role as string;
	if (role !== 'admin' && role !== 'expense-user') return new Response('Forbidden', { status: 403 });

	const dest  = event.params.id;
	const url   = new URL(event.request.url);
	const format = url.searchParams.get('format') ?? 'simple'; // 'simple' | 'weekly'
	const fromParam = url.searchParams.get('from');
	const toParam   = url.searchParams.get('to');

	if (!fromParam || !toParam) {
		return new Response('from and to query params are required (YYYY-MM-DD)', { status: 400 });
	}

	const [fy, fm, fd] = fromParam.split('-').map(Number);
	const [ty, tm, td] = toParam.split('-').map(Number);
	const dateFrom = new Date(Date.UTC(fy, fm - 1, fd,  0,  0,  0,   0));
	const dateTo   = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999));

	const conditions: Parameters<typeof and>[0][] = [
		eq(TransactionDetail.source_id, dest),
		gte(TransactionDetail.created_at, dateFrom),
		lte(TransactionDetail.created_at, dateTo),
	];

	// Weekly report = same format, just filtered to pending only
	if (format === 'weekly') {
		conditions.push(eq(TransactionDetail.payment_status, 'pending'));
	}

	const results = await db
		.select(getViewSelectedFields(TransactionDetail))
		.from(TransactionDetail)
		.where(and(...conditions))
		.orderBy(asc(TransactionDetail.created_at));

	const rows: string[] = ['date,category,quantity,amount'];
	for (const row of results) {
		const date     = fmtDate(new Date(row.created_at));
		const category = escapeCSV(row.entity_name ?? 'Unknown');
		const quantity = fmtNum(Number(row.quantity ?? 0));
		const amount   = fmtNum(Number(row.amount   ?? 0));
		rows.push(`${date},${category},${quantity},${amount}`);
	}

	const filename = format === 'weekly'
		? `weekly-report-${fromParam}-to-${toParam}.csv`
		: `expenses-${fromParam}-to-${toParam}.csv`;

	return new Response(rows.join('\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}
