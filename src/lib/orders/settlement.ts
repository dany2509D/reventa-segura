import { and, eq } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { events, ledgerEntries, listings, orders } from '@/lib/db/schema';
import type { Tx } from '@/lib/db/types';
import type { PaymentGateway } from '@/lib/payments/gateway';
import { appendEntry } from './ledger';
import { applyTransition } from './service';
import { transition, type OrderEvent } from './state-machine';

/*
 * Money-moving transitions of a paid order (refund to the buyer, release to the seller), shared by
 * dispute resolution, the maintenance job and event cancellation. Callers MUST hold the order row
 * lock (lockOrderForUpdate) inside the transaction they pass in, and re-check the state after it.
 */

export type OrderRow = typeof orders.$inferSelect;
export type EventRow = typeof events.$inferSelect;

/** Runs inside the releasing transaction, after the order is `liberada` (Task 10 queues the payout). */
export type OnReleased = (tx: Tx, order: OrderRow) => Promise<void>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);

/** SELECT ... FOR UPDATE on the order row only; undefined when absent (or not a UUID). */
export async function lockOrderForUpdate(tx: Tx, id: string): Promise<OrderRow | undefined> {
  if (!isUuid(id)) return undefined;
  const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
  return o;
}

/** The order's event (plain read, no lock: event rows are not changed by order flows). */
export async function eventForOrder(tx: Tx, order: { listingId: string }): Promise<EventRow> {
  const [row] = await tx
    .select({ event: events })
    .from(listings)
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(eq(listings.id, order.listingId));
  if (!row) throw new Error(`Event of listing ${order.listingId} not found`);
  return row.event;
}

/**
 * Paid order -> `reembolsada`: state transition, provider refund of the full price and a `refund`
 * ledger entry, with the same sign/ref conventions as the late-payment refund in service.ts
 * (amount -priceCents, ref = provider refundRef). The provider call happens while the order lock is
 * held; if anything fails the transaction rolls back and the (idempotent per providerRef) refund is
 * retried by the next attempt.
 */
export async function refundPaidOrder(
  tx: Tx,
  gw: PaymentGateway,
  order: OrderRow,
  event: OrderEvent,
  o: { action: string; actorId: string | null; detail?: object },
): Promise<{ refundRef: string }> {
  if (transition(order.state, event) !== 'reembolsada') {
    throw new Error(`${event} does not refund an order in state ${order.state}`);
  }
  if (!order.providerRef) throw new Error(`Order ${order.id} has no payment reference to refund`);
  const [prior] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orderId, order.id), eq(ledgerEntries.kind, 'refund')))
    .limit(1);
  if (prior) throw new Error(`Order ${order.id} already has a refund entry`);

  await applyTransition(tx, order, event, { action: o.action, actorId: o.actorId, detail: o.detail });
  const { refundRef } = await gw.refund(order.providerRef, order.priceCents);
  await appendEntry(tx, { orderId: order.id, kind: 'refund', amountCents: -order.priceCents, ref: refundRef });
  await audit(tx, {
    actorId: o.actorId,
    action: 'order.refunded',
    entity: 'order',
    entityId: order.id,
    detail: { providerRef: order.providerRef, refundRef, amountCents: order.priceCents, cause: event },
  });
  return { refundRef };
}

/** Order -> `liberada`, then `onReleased` in the same transaction (a throw rolls the release back). */
export async function releaseOrder(
  tx: Tx,
  order: OrderRow,
  event: 'WINDOW_ELAPSED' | 'DISPUTE_RELEASE',
  o: { action: string; actorId: string | null; detail?: object },
  onReleased?: OnReleased,
): Promise<OrderRow> {
  if (transition(order.state, event) !== 'liberada') {
    throw new Error(`${event} does not release an order in state ${order.state}`);
  }
  const state = await applyTransition(tx, order, event, { action: o.action, actorId: o.actorId, detail: o.detail });
  const released: OrderRow = { ...order, state };
  if (onReleased) await onReleased(tx, released);
  return released;
}
