import { query } from '@solidjs/router';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { db } from '~/drizzle/client';
import { Transaction, TransportationCost } from '~/drizzle/schema';

export const loadTotalAmount = query(
    async (
        dest: string,
        filter: string,
        dateRange: { from: string; to: string } | null
    ) => {
        'use server';

        // Apply same date filter logic as loadTransactions
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

        const baseFilter = and(
            eq(Transaction.destination_id, dest),
            dateFilter
        );

        const totalAmount = await db
            .select({
                total: sql<number>`SUM(COALESCE(${Transaction.amount}, 0) + COALESCE(${TransportationCost.cost}, 0))`,
            })
            .from(Transaction)
            .leftJoin(TransportationCost, eq(Transaction.transportation_cost_id, TransportationCost.id))
            .where(baseFilter)
            .then((rows) => rows[0].total);

        return totalAmount;
    },
    'total-expense-amount'
);
