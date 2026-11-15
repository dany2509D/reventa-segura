import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { auditLog, disputes, ledgerEntries, orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import type { FakeGateway } from '@/lib/payments/fake-gateway';
import { handlePaymentWebhook, startCheckout } from './service';
import { seedListing } from './test-fixtures';

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/**
 * Test-only: a sale paid through the real checkout + webhook flow, so the order carries the real
 * providerRef and charge/fee/seller_due ledger entries. 'file' delivery ends in `entrada_recibida`,
 * 'transfer' in `transferencia_pendiente` (deadline = min(paidAt + 2 h, startsAt)).
 */
export async function seedPaidOrder(
  db: Db,
  gw: FakeGateway,
  o: { deliveryMode?: 'transfer' | 'file'; startsAt?: Date; paidAt?: Date; askCents?: number } = {},
) {
  const askCents = o.askCents ?? 5000;
  const startsAt = o.startsAt ?? new Date(Date.now() + 7 * DAY);
  const paidAt = o.paidAt ?? new Date(startsAt.getTime() - DAY);
  const fx = await seedListing(db, { deliveryMode: o.deliveryMode ?? 'file', startsAt, askCents });
  const { orderId } = await startCheckout(db, gw, fx.buyer.id, fx.listing.id, new Date(paidAt.getTime() - MIN));
  const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: askCents });
  await handlePaymentWebhook(db, gw, rawBody, headers, paidAt);
  return { ...fx, order: await getOrder(db, orderId) };
}

export async function getOrder(db: Db, id: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  return o;
}

export const ledgerOf = (db: Db, orderId: string) =>
  db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId)).orderBy(asc(ledgerEntries.createdAt));

export const auditOf = (db: Db, orderId: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'order'), eq(auditLog.entityId, orderId)))
    .orderBy(asc(auditLog.createdAt));

export const disputesOf = (db: Db, orderId: string) => db.select().from(disputes).where(eq(disputes.orderId, orderId));

/** A well-formed private file path owned by `ownerId` (the blob itself is not created). */
export const filePath = (kind: 'proof' | 'evidence', ownerId: string) => `${kind}/${ownerId}/${randomUUID()}`;
