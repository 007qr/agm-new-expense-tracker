import { createId } from '@paralleldrive/cuid2';
import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, index, numeric, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const PaymentStatus = ['paid', 'pending', 'advance'] as const;
export const TransactionType = ['credit', 'debit'] as const;
export const EntityType = ['payroll', 'cash'] as const;

export const paymentStatusEnum = pgEnum('payment_status', PaymentStatus);
export const transactionTypeEnum = pgEnum('transaction_type', TransactionType);
export const entityTypeEnum = pgEnum('entity_type', EntityType);

export const Transaction = pgTable(
    'transaction',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => 'tran_' + createId()),
        entity_id: text('entity_id').references(() => Entity.id),
        entity_variant_id: text('entity_variant_id').references(() => EntityVariant.id),
        destination_id: text('destination_id').references(() => Destination.id),
        source_id: text('source_id').references(() => Destination.id),
        payment_status: paymentStatusEnum('status').notNull(),
        transportation_cost_id: text('transportation_cost_id').references(() => TransportationCost.id),
        quantity: numeric('quantity', { precision: 18, scale: 6 }),
        type: transactionTypeEnum('type'),
        rate: numeric('rate', { precision: 18, scale: 6 }),
        // TODO: Consider storing money as integer paise to avoid precision issues.
        amount: numeric('amount', { precision: 18, scale: 2 }),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('transaction_entity_id_idx').on(table.entity_id),
        index('transaction_destination_id_idx').on(table.destination_id),
        index('transaction_created_at_idx').on(table.created_at),
    ],
);

export const TransportationCost = pgTable('transportation_cost', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => 'tc_' + createId()),
    entity_id: text('entity_id').references(() => Entity.id),
    vehicle_type: text('vehicle_type').default(''),
    reg_no: text('reg_no').notNull().default(''),
    // TODO: Consider storing money as integer paise to avoid precision issues.
    cost: numeric('cost', { precision: 18, scale: 2 }).notNull().default('0'),
});

export const Destination = pgTable('destination', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => 'dest_' + createId()),
    name: text('name').notNull().unique(),
    is_warehouse: boolean('is_warehouse').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const Entity = pgTable('entity', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => 'ent_' + createId()),
    name: text('name').notNull().unique(),
    type: entityTypeEnum('type').notNull(),
    unit: text('unit').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const EntityVariant = pgTable(
    'entity_variant',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => 'ev_' + createId()),
        entity_id: text('entity_id').references(() => Entity.id),
        length: numeric('entity_length', { precision: 18, scale: 6 }),
        width: numeric('entity_width', { precision: 18, scale: 6 }),
        height: numeric('entity_height', { precision: 18, scale: 6 }),
        thickness: numeric('entity_thickness', { precision: 18, scale: 6 }),
        thickness_unit: text('thickness_unit'),
        dimension_unit: text('dimension_unit'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [index('entity_variant_entity_id_idx').on(table.entity_id)],
);

export const WarehouseTransaction = pgTable(
    'warehouse_transaction',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => 'wtran_' + createId()),
        entity_id: text('entity_id').references(() => EntityWarehouse.id),
        entity_variant_id: text('entity_variant_id').references(() => EntityVariantWarehouse.id),
        source_id: text('source_id').references(() => Destination.id),
        destination_id: text('destination_id').references(() => Destination.id),
        quantity: numeric('quantity', { precision: 18, scale: 6 }),
        type: transactionTypeEnum('type'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('warehouse_transaction_entity_id_idx').on(table.entity_id),
        index('warehouse_transaction_source_id_idx').on(table.source_id),
        index('warehouse_transaction_destination_id_idx').on(table.destination_id),
        index('warehouse_transaction_created_at_idx').on(table.created_at),
    ],
);

export const EntityWarehouse = pgTable('entity_warehouse', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => 'went_' + createId()),
    name: text('name').notNull().unique(),
    type: entityTypeEnum('type').notNull(),
    unit: text('unit').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const EntityVariantWarehouse = pgTable(
    'entity_variant_warehouse',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => 'wev_' + createId()),
        entity_id: text('entity_id').references(() => EntityWarehouse.id),
        length: numeric('entity_length', { precision: 18, scale: 6 }),
        width: numeric('entity_width', { precision: 18, scale: 6 }),
        height: numeric('entity_height', { precision: 18, scale: 6 }),
        thickness: numeric('entity_thickness', { precision: 18, scale: 6 }),
        thickness_unit: text('thickness_unit'),
        dimension_unit: text('dimension_unit'),
        created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updated_at: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [index('entity_variant_warehouse_entity_id_idx').on(table.entity_id)],
);

/// === AUTH Schema ===

export const user = pgTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    role: text('role'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
});

export const session = pgTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: timestamp('expires_at').notNull(),
        token: text('token').notNull().unique(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        impersonatedBy: text('impersonated_by'),
    },
    (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at'),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
        scope: text('scope'),
        password: text('password'),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at')
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}));
