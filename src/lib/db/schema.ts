import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  phone: text('phone').notNull().unique(), // E.164
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  identityStatus: text('identity_status', { enum: ['none', 'pending', 'approved', 'rejected'] })
    .notNull()
    .default('none'),
  idDocPath: text('id_doc_path'),
  selfiePath: text('selfie_path'),
  totpSecret: text('totp_secret'),
  createdAt: createdAt(),
});

export const events = pgTable('events', {
  id: id(),
  name: text('name').notNull(),
  venue: text('venue').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radiusM: integer('radius_m').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  faceValueCents: integer('face_value_cents').notNull(),
  allowsTransfer: boolean('allows_transfer').notNull().default(true),
  resaleProhibited: boolean('resale_prohibited').notNull().default(false),
  status: text('status', { enum: ['active', 'cancelled'] }).notNull().default('active'),
});

export const listings = pgTable(
  'listings',
  {
    id: id(),
    sellerId: uuid('seller_id').notNull().references(() => users.id),
    eventId: uuid('event_id').notNull().references(() => events.id),
    askCents: integer('ask_cents').notNull(),
    deliveryMode: text('delivery_mode', { enum: ['transfer', 'file'] }).notNull(),
    status: text('status', { enum: ['pending', 'verified', 'rejected', 'sold', 'withdrawn'] })
      .notNull()
      .default('pending'),
    fingerprint: text('fingerprint').notNull(),
    proofPath: text('proof_path').notNull(),
    filePath: text('file_path'),
    createdAt: createdAt(),
  },
  (t) => [
    // A ticket can only be actively listed once; rejected/withdrawn listings free the fingerprint.
    uniqueIndex('listings_active_fingerprint_uq')
      .on(t.fingerprint)
      .where(sql`${t.status} in ('pending', 'verified', 'sold')`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    listingId: uuid('listing_id').notNull().references(() => listings.id),
    buyerId: uuid('buyer_id').notNull().references(() => users.id),
    state: text('state', {
      enum: [
        'creada',
        'transferencia_pendiente',
        'entrada_recibida',
        'ingreso_confirmado',
        'disputada',
        'liberada',
        'liquidada',
        'reembolsada',
        'cancelada',
      ],
    })
      .notNull()
      .default('creada'),
    priceCents: integer('price_cents').notNull(),
    feeCents: integer('fee_cents').notNull(),
    providerRef: text('provider_ref'),
    transferDeadline: timestamp('transfer_deadline', { withTimezone: true }),
    needsManualReview: boolean('needs_manual_review').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('orders_listing_idx').on(t.listingId),
    // Idempotency: a payment provider reference can back at most one order.
    uniqueIndex('orders_provider_ref_uq').on(t.providerRef).where(sql`${t.providerRef} is not null`),
    // Double-sale guard: at most one live order per listing.
    uniqueIndex('orders_live_listing_uq')
      .on(t.listingId)
      .where(sql`${t.state} not in ('cancelada', 'reembolsada')`),
  ],
);

export const ledgerEntries = pgTable('ledger_entries', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  kind: text('kind').notNull(), // charge | fee | seller_due | refund | payout
  amountCents: integer('amount_cents').notNull(),
  ref: text('ref').notNull(),
  createdAt: createdAt(),
});

export const disputes = pgTable('disputes', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  openedBy: uuid('opened_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  evidencePaths: jsonb('evidence_paths').$type<string[]>().notNull().default([]),
  status: text('status', { enum: ['open', 'refunded', 'released'] }).notNull().default('open'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: createdAt(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const payouts = pgTable('payouts', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  sellerId: uuid('seller_id').notNull().references(() => users.id),
  amountCents: integer('amount_cents').notNull(),
  status: text('status', { enum: ['queued', 'paid'] }).notNull().default('queued'),
  bankRef: text('bank_ref'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

export const otpCodes = pgTable('otp_codes', {
  id: id(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  salt: text('salt').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  mfa: boolean('mfa').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const auditLog = pgTable('audit_log', {
  id: id(),
  actorId: uuid('actor_id'), // null for system actions
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  detail: jsonb('detail'),
  createdAt: createdAt(),
});
