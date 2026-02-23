import { type APIEvent } from '@solidjs/start/server';
import { eq } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Transaction } from '~/drizzle/schema';

export async function GET(event: APIEvent) {
	const secret = process.env.CRON_SECRET;
	const authHeader = event.request.headers.get('authorization');

	if (!secret || authHeader !== `Bearer ${secret}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const result = await db
		.update(Transaction)
		.set({ payment_status: 'paid' })
		.where(eq(Transaction.payment_status, 'pending'))
		.returning({ id: Transaction.id });

	return new Response(
		JSON.stringify({ success: true, updated: result.length }),
		{ headers: { 'Content-Type': 'application/json' } },
	);
}
