import { query } from '@solidjs/router';
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Transaction } from '~/drizzle/schema';

export const loadTotalAmount = query(async (dest: string, entity: string) => {
    'use server';

    const entityFilter = entity?.trim();
    const baseFilter = or(eq(Transaction.destination_id, dest), eq(Transaction.source_id, dest));
    const filters = entityFilter ? and(baseFilter, eq(Transaction.entity_id, entityFilter)) : baseFilter;

    const totalAmount = await db
        .select({ total: sql<number>`SUM(${Transaction.amount})` })
        .from(Transaction)
        .where(filters)
        .then((rows) => rows[0].total);

    return totalAmount;
}, 'total-expense-amount');
