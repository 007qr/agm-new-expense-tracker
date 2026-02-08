import { query } from '@solidjs/router';
import { eq, sql } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Transaction, TransportationCost } from '~/drizzle/schema';

export const loadTotalAmount = query(async (dest: string) => {
    'use server';

    const baseFilter = eq(Transaction.destination_id, dest);

    const totalAmount = await db
        .select({
            total: sql<number>`SUM(COALESCE(${Transaction.amount}, 0) + COALESCE(${TransportationCost.cost}, 0))`,
        })
        .from(Transaction)
        .leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
        .where(baseFilter)
        .then((rows) => rows[0].total);

    return totalAmount;
}, 'total-expense-amount');
