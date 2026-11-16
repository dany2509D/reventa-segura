import { and, eq } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { listings, orders, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { watermark } from '@/lib/tickets/watermark';
import { InvalidUploadError } from '@/lib/uploads/errors';
import type { BlobStore } from '@/lib/uploads/store';
import { detectType, parseFilePath } from '@/lib/uploads/uploads';
import { InvalidTransitionError, transition, type OrderState } from './state-machine';

export class TransferDeadlineError extends Error {
  constructor(message = 'The transfer deadline has passed') {
    super(message);
    this.name = 'TransferDeadlineError';
  }
}

/** The stored ticket cannot be delivered as a watermarked image (v1: PDF or undecodable file). */
export class UnsupportedDeliveryError extends Error {
  constructor(message = 'The ticket file cannot be delivered') {
    super(message);
    this.name = 'UnsupportedDeliveryError';
  }
}

/** Paid states in which a file-mode buyer may download the (watermarked) ticket. */
export const DELIVERABLE_STATES: readonly OrderState[] = [
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
  'liquidada',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Order = typeof orders.$inferSelect;

/**
 * Rules for the buyer confirming a transferred ticket: only the buyer, only while the transfer
 * is pending, and only before the deadline (after it the maintenance job refunds the order).
 * A pending transfer without a deadline is treated as expired (fail closed).
 */
function assertCanConfirm(
  order: Pick<Order, 'buyerId' | 'state' | 'transferDeadline' | 'paymentMethod'>,
  buyerId: string,
  now: Date,
) {
  if (order.buyerId !== buyerId) throw new ForbiddenError();
  // A manual (Yappy / ACH) order in this state is still unpaid: it has nothing to confirm.
  if (order.paymentMethod !== null) throw new InvalidTransitionError(order.state, 'RECEIVED_CONFIRMED');
  transition(order.state, 'RECEIVED_CONFIRMED'); // InvalidTransitionError outside transferencia_pendiente
  if (!order.transferDeadline || now.getTime() >= order.transferDeadline.getTime()) {
    throw new TransferDeadlineError();
  }
}

/**
 * Unlocked pre-flight of confirmReceived, so a route can refuse before storing an upload.
 * confirmReceived re-checks everything under the row lock.
 */
export async function checkCanConfirmReceived(
  db: Db,
  buyerId: string,
  orderId: string,
  now: Date = new Date(),
): Promise<void> {
  if (!UUID_RE.test(orderId)) throw new NotFoundError();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new NotFoundError();
  assertCanConfirm(order, buyerId, now);
}

/**
 * The buyer confirms the seller's transfer arrived (`transferencia_pendiente → entrada_recibida`).
 * `screenshotPath` must be the buyer's own private `proof` upload; it is kept in the audit row.
 */
export async function confirmReceived(
  db: Db,
  buyerId: string,
  orderId: string,
  screenshotPath: string,
  now: Date = new Date(),
): Promise<void> {
  if (!UUID_RE.test(orderId)) throw new NotFoundError();
  const file = parseFilePath(screenshotPath);
  if (!file || file.kind !== 'proof' || file.ownerId !== buyerId) {
    throw new ValidationError('Invalid screenshot path');
  }

  await db.transaction(async (tx) => {
    // Only the order row is locked (no listing lock), so this cannot deadlock with the
    // listing-then-order lockers in service.ts.
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new NotFoundError();
    assertCanConfirm(order, buyerId, now);

    const to = transition(order.state, 'RECEIVED_CONFIRMED');
    const updated = await tx
      .update(orders)
      .set({ state: to })
      .where(and(eq(orders.id, order.id), eq(orders.state, order.state)))
      .returning({ id: orders.id });
    if (updated.length !== 1) throw new Error(`Order ${order.id} is no longer ${order.state}`);
    await audit(tx, {
      actorId: buyerId,
      action: 'order.received_confirmed',
      entity: 'order',
      entityId: order.id,
      detail: {
        from: order.state,
        to,
        event: 'RECEIVED_CONFIRMED',
        screenshot: { kind: 'proof', path: screenshotPath },
      },
    });
  });
}

/** Watermark text: country code, last 4 phone digits and a short order id. Never the full phone. */
export function watermarkLabel(phone: string, orderId: string): string {
  const prefix = phone.startsWith('+507') ? '+507' : '';
  return `${prefix}…${phone.replace(/\D/g, '').slice(-4)} · ${orderId.slice(0, 8)}`;
}

/**
 * The seller's ticket file for a paid file-mode order, watermarked for its buyer.
 * The raw stored file is never returned.
 */
export async function getDeliveredFile(
  db: Db,
  store: BlobStore,
  buyerId: string,
  orderId: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (!UUID_RE.test(orderId)) throw new NotFoundError();
  const [row] = await db
    .select({
      id: orders.id,
      buyerId: orders.buyerId,
      state: orders.state,
      sellerId: listings.sellerId,
      deliveryMode: listings.deliveryMode,
      filePath: listings.filePath,
    })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .where(eq(orders.id, orderId));
  if (!row) throw new NotFoundError();
  if (row.buyerId !== buyerId) throw new ForbiddenError();
  if (!DELIVERABLE_STATES.includes(row.state)) throw new ForbiddenError();
  if (row.deliveryMode !== 'file' || !row.filePath) throw new NotFoundError('No ticket file for this order');

  // Only ever the seller's own `ticket` upload, never another kind of private file.
  const file = parseFilePath(row.filePath);
  if (!file || file.kind !== 'ticket' || file.ownerId !== row.sellerId) {
    throw new NotFoundError('No ticket file for this order');
  }
  const raw = await store.get(row.filePath);
  if (!raw) throw new NotFoundError('No ticket file for this order');
  if (detectType(raw) === 'pdf') throw new UnsupportedDeliveryError('PDF tickets cannot be watermarked');

  // The buyer's phone (PII) is read only once every access and file check has passed.
  const [buyer] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, row.buyerId));
  if (!buyer) throw new Error(`Buyer of order ${row.id} not found`);

  try {
    const bytes = await watermark(raw, watermarkLabel(buyer.phone, row.id));
    return { bytes, contentType: 'image/jpeg' };
  } catch (e) {
    if (e instanceof InvalidUploadError) throw new UnsupportedDeliveryError();
    throw e;
  }
}
