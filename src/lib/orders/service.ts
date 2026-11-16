import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { events, ledgerEntries, listings, orders } from '@/lib/db/schema';
import type { Actor, Db, Tx } from '@/lib/db/types';
import { assertAdmin } from '@/lib/authz';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import type { PaymentGateway } from '@/lib/payments/gateway';
import { computeFees, DEFAULT_FEE_BPS } from '@/lib/pricing/pricing';
import { isSellerBlocked } from '@/lib/tickets/listings';
import { appendEntry } from './ledger';
import { InvalidTransitionError, transition, type OrderEvent, type OrderState } from './state-machine';

/** An unpaid `creada` order older than this is abandoned and stops holding its listing. */
export const CHECKOUT_TTL_MS = 15 * 60 * 1000;
/** The seller must transfer the ticket within 2 h of payment (or before the event, if sooner). */
export const TRANSFER_WINDOW_MS = 2 * 60 * 60 * 1000;

export class ListingUnavailableError extends Error {
  constructor(message = 'Listing is not available for purchase') {
    super(message);
    this.name = 'ListingUnavailableError';
  }
}

export class SelfPurchaseError extends Error {
  constructor(message = 'Sellers cannot buy their own listing') {
    super(message);
    this.name = 'SelfPurchaseError';
  }
}

export class AmountMismatchError extends Error {
  constructor(
    readonly expectedCents: number,
    readonly receivedCents: number,
    readonly orderId?: string,
  ) {
    super(`Webhook amount ${receivedCents} does not match order price ${expectedCents}`);
    this.name = 'AmountMismatchError';
  }
}

export class UnknownPaymentError extends Error {
  constructor(readonly providerRef: string) {
    super('No order matches this payment reference');
    this.name = 'UnknownPaymentError';
  }
}

type Order = typeof orders.$inferSelect;
type Listing = typeof listings.$inferSelect;
type Event = typeof events.$inferSelect;

/*
 * Concurrency rules for every function in this module:
 * - Each state change and ledger write runs in one transaction with its audit() row.
 * - Rows are locked with SELECT ... FOR UPDATE, always listing before order, so two operations
 *   on the same sale can never deadlock.
 * - Order updates are guarded by `WHERE state = <expected>`; a mismatch aborts the transaction.
 */

export async function startCheckout(
  db: Db,
  gw: PaymentGateway,
  buyerId: string,
  listingId: string,
  now: Date = new Date(),
): Promise<{ orderId: string; checkoutUrl: string }> {
  // SEG-08: a seller who lost too many disputes stops selling, including listings that were already
  // verified. Reported as 'unavailable' so a buyer learns nothing about the seller.
  const [preview] = await db.select({ sellerId: listings.sellerId }).from(listings).where(eq(listings.id, listingId));
  if (preview && (await isSellerBlocked(db, preview.sellerId, now))) throw new ListingUnavailableError();

  let order: Order;
  try {
    order = await db.transaction(async (tx) => {
      const listing = await lockListing(tx, listingId);
      if (!listing || listing.status !== 'verified') throw new ListingUnavailableError();
      if (listing.sellerId === buyerId) throw new SelfPurchaseError();
      const event = await getEvent(tx, listing.eventId);
      if (event.status !== 'active' || event.startsAt.getTime() <= now.getTime()) {
        throw new ListingUnavailableError();
      }

      // An unpaid checkout holds the listing for CHECKOUT_TTL_MS; after that it is abandoned here
      // (the maintenance job does the same via abandonStaleCheckouts).
      const [held] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.listingId, listingId), eq(orders.state, 'creada')))
        .for('update');
      if (held) {
        if (!isStale(held, now)) throw new ListingUnavailableError();
        await applyTransition(tx, held, 'CHECKOUT_ABANDONED', { action: 'order.checkout_abandoned' });
      }

      const { feeCents } = computeFees(listing.askCents, DEFAULT_FEE_BPS);
      const [created] = await tx
        .insert(orders)
        .values({ listingId, buyerId, state: 'creada', priceCents: listing.askCents, feeCents, createdAt: now })
        .returning();
      await audit(tx, {
        actorId: buyerId,
        action: 'order.created',
        entity: 'order',
        entityId: created.id,
        detail: { listingId, priceCents: created.priceCents, feeCents, state: 'creada' },
      });
      return created;
    });
  } catch (e) {
    // Backstop for any live order the checks above missed: the partial unique index wins.
    if (isUniqueViolation(e, 'orders_live_listing_uq')) throw new ListingUnavailableError();
    throw e;
  }

  // The provider call happens outside the transaction so no row lock is held during network I/O.
  let checkout: { checkoutUrl: string; providerRef: string };
  try {
    checkout = await gw.createCheckout({ orderId: order.id, amountCents: order.priceCents });
  } catch (e) {
    try {
      await db.transaction(async (tx) => {
        const o = await lockOrder(tx, order.id);
        if (o.state === 'creada') {
          await applyTransition(tx, o, 'CHECKOUT_ABANDONED', { action: 'order.checkout_failed' });
        }
      });
    } catch {
      // Keep the provider error; the order is abandoned by the CHECKOUT_TTL_MS rule anyway.
    }
    throw e;
  }

  await db.transaction(async (tx) => {
    // Stored even if the order was abandoned meanwhile, so a late payment can still be refunded.
    await tx
      .update(orders)
      .set({ providerRef: checkout.providerRef })
      .where(and(eq(orders.id, order.id), isNull(orders.providerRef)));
    await audit(tx, {
      actorId: buyerId,
      action: 'order.checkout_started',
      entity: 'order',
      entityId: order.id,
      detail: { providerRef: checkout.providerRef },
    });
  });
  return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
}

/**
 * Processes a signed provider notification exactly once. Replays and concurrent duplicates are
 * no-ops: the `charge` ledger entry marks a payment as recorded.
 */
export async function handlePaymentWebhook(
  db: Db,
  gw: PaymentGateway,
  rawBody: string,
  headers: Record<string, string>,
  now: Date = new Date(),
): Promise<void> {
  const evt = gw.parseWebhook(rawBody, headers); // throws InvalidWebhookError
  const [ref] = await db
    .select({ id: orders.id, listingId: orders.listingId })
    .from(orders)
    .where(eq(orders.providerRef, evt.providerRef));
  if (!ref) throw new UnknownPaymentError(evt.providerRef);

  // Set when the amount does not match: the audit row commits, then the error is thrown.
  let mismatch: AmountMismatchError | undefined;
  await db.transaction(async (tx) => {
    const listing = await lockListing(tx, ref.listingId);
    const order = await lockOrder(tx, ref.id);
    if (!listing) throw new Error(`Listing ${ref.listingId} of order ${order.id} not found`);

    if (evt.amountCents !== order.priceCents) {
      mismatch = new AmountMismatchError(order.priceCents, evt.amountCents, order.id);
      await audit(tx, {
        actorId: null,
        action: 'payment.amount_mismatch',
        entity: 'order',
        entityId: order.id,
        detail: {
          providerRef: evt.providerRef,
          status: evt.status,
          expectedCents: order.priceCents,
          receivedCents: evt.amountCents,
        },
      });
      return;
    }

    if (evt.status === 'failed') {
      // Only an unpaid checkout can fail; anything later is a stale or out-of-order delivery.
      if (order.state === 'creada') {
        await applyTransition(tx, order, 'CHECKOUT_ABANDONED', {
          action: 'order.payment_failed',
          detail: { providerRef: evt.providerRef },
        });
      }
      return;
    }

    if (await hasCharge(tx, order.id)) return;

    let state: OrderState = order.state;
    if (state === 'creada') {
      const event = await getEvent(tx, listing.eventId);
      if (listing.status === 'verified' && event.status === 'active') {
        await recordSale(tx, order, listing, event, evt.providerRef, now);
        return;
      }
      // The ticket can no longer be delivered (listing withdrawn/rejected or event cancelled).
      const cancelEvent: OrderEvent = event.status === 'cancelled' ? 'EVENT_CANCELLED' : 'CHECKOUT_ABANDONED';
      state = await applyTransition(tx, order, cancelEvent, {
        action: 'order.cancelled_at_payment',
        detail: { providerRef: evt.providerRef, listingStatus: listing.status, eventStatus: event.status },
      });
    }
    if (state === 'cancelada') {
      await refundUnfulfillablePayment(tx, gw, order, evt.providerRef);
      return;
    }
    throw new Error(`Order ${order.id} is ${state} but has no charge entry`);
  });

  if (mismatch) throw mismatch;
}

/**
 * Cancels unpaid checkouts older than CHECKOUT_TTL_MS, and manual (Yappy / ACH) orders whose
 * transfer deadline passed without a receipt. Returns how many were abandoned.
 */
export async function abandonStaleCheckouts(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CHECKOUT_TTL_MS);
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.state, 'creada'), lt(orders.createdAt, cutoff)));
  const manualCandidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.state, 'transferencia_pendiente'),
        isNotNull(orders.paymentMethod),
        lt(orders.transferDeadline, now),
      ),
    );

  let abandoned = 0;
  for (const c of candidates) {
    // Only the order row is locked, and nothing else is awaited while holding it: no deadlock
    // with the listing-then-order lockers. Re-checked under the lock (a payment may have won).
    const done = await db.transaction(async (tx) => {
      const o = await lockOrder(tx, c.id);
      if (o.state !== 'creada' || !isStale(o, now)) return false;
      await applyTransition(tx, o, 'CHECKOUT_ABANDONED', { action: 'order.checkout_abandoned' });
      return true;
    });
    if (done) abandoned++;
  }
  for (const c of manualCandidates) {
    const done = await db.transaction(async (tx) => {
      const o = await lockOrder(tx, c.id);
      const expired = o.transferDeadline !== null && o.transferDeadline.getTime() < now.getTime();
      if (o.state !== 'transferencia_pendiente' || o.paymentMethod === null || !expired) return false;
      await applyTransition(tx, o, 'MANUAL_EXPIRED', { action: 'order.manual_expired' });
      return true;
    });
    if (done) abandoned++;
  }
  return abandoned;
}

/** A manual order is paid off-platform: it only needs a short, unique reference for the transfer note. */
export const MANUAL_PAYMENT_WINDOW_MS = 15 * 60 * 1000;
export const MANUAL_METHODS = ['yappy', 'ach'] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function shortRef(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += REF_ALPHABET[b % REF_ALPHABET.length];
  return `RS-${s}`;
}

/** Stand-in for the gateway on manual orders: nothing is created remotely, only a reference. */
const manualGateway: PaymentGateway = {
  createCheckout: async () => ({ checkoutUrl: '', providerRef: shortRef() }),
  parseWebhook: () => {
    throw new Error('Manual orders have no provider webhooks');
  },
  refund: async () => {
    throw new Error('Manual orders are refunded by hand');
  },
};

/**
 * Manual checkout: reuses startCheckout's atomic listing reservation, then moves the order to
 * `transferencia_pendiente` with a 15-minute deadline for the buyer to pay and upload the receipt.
 */
export async function startManualCheckout(
  db: Db,
  buyerId: string,
  listingId: string,
  method: ManualMethod,
  now: Date = new Date(),
): Promise<{ orderId: string; ref: string; amount: number; transferDeadline: Date }> {
  await abandonStaleCheckouts(db, now);
  const { orderId } = await startCheckout(db, manualGateway, buyerId, listingId, now);
  const transferDeadline = new Date(now.getTime() + MANUAL_PAYMENT_WINDOW_MS);
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.state !== 'creada' || !o.providerRef) throw new ListingUnavailableError();
    await applyTransition(tx, o, 'MANUAL_PENDING', {
      action: 'order.manual_started',
      actorId: buyerId,
      set: { paymentMethod: method, transferDeadline },
      detail: { method, ref: o.providerRef, transferDeadline: transferDeadline.toISOString() },
    });
    return { orderId, ref: o.providerRef, amount: o.priceCents, transferDeadline };
  });
}

export class ProofNotAllowedError extends Error {
  constructor(message = 'This order does not accept a payment receipt') {
    super(message);
    this.name = 'ProofNotAllowedError';
  }
}

export class ProofWindowClosedError extends Error {
  constructor(message = 'The payment window has closed') {
    super(message);
    this.name = 'ProofWindowClosedError';
  }
}

/** Cheap pre-check (before reading the upload): the buyer owns a manual order that still takes a receipt. */
export function assertProofAllowed(
  o: { buyerId: string; state: OrderState; paymentMethod: string | null; transferDeadline: Date | null },
  buyerId: string,
  now: Date,
): void {
  if (o.buyerId !== buyerId) throw new ForbiddenError();
  if (o.paymentMethod === null || (o.state !== 'transferencia_pendiente' && o.state !== 'comprobante_en_revision')) {
    throw new ProofNotAllowedError();
  }
  if (!o.transferDeadline || now.getTime() >= o.transferDeadline.getTime()) throw new ProofWindowClosedError();
}

/**
 * Records the stored receipt and moves the order to `comprobante_en_revision`. Returns the key of
 * the receipt it replaced (if any) so the caller can delete that blob.
 */
export async function submitPaymentProof(
  db: Db,
  buyerId: string,
  orderId: string,
  proof: { key: string; reference: string | null },
  now: Date = new Date(),
): Promise<{ replacedKey: string | null }> {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertProofAllowed(o, buyerId, now);
    await applyTransition(tx, o, 'PROOF_SUBMITTED', {
      action: 'order.proof_submitted',
      actorId: buyerId,
      set: { paymentProofKey: proof.key, paymentReference: proof.reference },
      detail: { method: o.paymentMethod, replaced: o.paymentProofKey !== null },
    });
    return { replacedKey: o.paymentProofKey };
  });
}

async function recordSale(tx: Tx, order: Order, listing: Listing, event: Event, providerRef: string, paidAt: Date) {
  const isTransfer = listing.deliveryMode === 'transfer';
  const transferDeadline = isTransfer
    ? new Date(Math.min(paidAt.getTime() + TRANSFER_WINDOW_MS, event.startsAt.getTime()))
    : null;
  await applyTransition(tx, order, isTransfer ? 'PAID_TRANSFER' : 'PAID_FILE', {
    action: 'order.paid',
    set: { transferDeadline },
    detail: {
      providerRef,
      paidAt: paidAt.toISOString(),
      transferDeadline: transferDeadline?.toISOString() ?? null,
      listingId: listing.id,
      listingStatus: 'sold',
    },
  });
  await tx.update(listings).set({ status: 'sold' }).where(eq(listings.id, listing.id));
  await appendSaleEntries(tx, order, providerRef);
}

async function appendSaleEntries(tx: Tx, order: Order, ref: string) {
  await appendEntry(tx, { orderId: order.id, kind: 'charge', amountCents: order.priceCents, ref });
  await appendEntry(tx, { orderId: order.id, kind: 'fee', amountCents: -order.feeCents, ref });
  await appendEntry(tx, { orderId: order.id, kind: 'seller_due', amountCents: order.priceCents - order.feeCents, ref });
}

const MANUAL_REVIEW_STATES: readonly OrderState[] = ['comprobante_en_revision', 'transferencia_pendiente'];
const ORDER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Locks listing then order (the module's lock order) and checks the order is a manual one under review. */
async function lockManualOrder(tx: Tx, orderId: string, listingId: string) {
  const listing = await lockListing(tx, listingId);
  const order = await lockOrder(tx, orderId);
  if (!listing) throw new NotFoundError();
  if (order.paymentMethod === null) throw new ValidationError('Not a manual payment order');
  if (!MANUAL_REVIEW_STATES.includes(order.state)) throw new InvalidTransitionError(order.state, 'MANUAL_APPROVED');
  return { listing, order };
}

async function manualOrderRef(db: Db, orderId: string): Promise<{ listingId: string }> {
  if (!ORDER_UUID_RE.test(orderId)) throw new NotFoundError();
  const [ref] = await db.select({ listingId: orders.listingId }).from(orders).where(eq(orders.id, orderId));
  if (!ref) throw new NotFoundError();
  return ref;
}

/**
 * An admin (2FA) confirms the Yappy / ACH money arrived: the order becomes paid exactly like a
 * gateway payment of a file-mode ticket (`entrada_recibida`, listing sold, charge/fee/seller_due
 * ledger entries), which unlocks the watermarked download for the buyer.
 */
export async function approveManualPayment(db: Db, actor: Actor, orderId: string, now: Date = new Date()): Promise<void> {
  assertAdmin(actor);
  const { listingId } = await manualOrderRef(db, orderId);
  await db.transaction(async (tx) => {
    const { listing, order } = await lockManualOrder(tx, orderId, listingId);
    const event = await getEvent(tx, listing.eventId);
    if (listing.status !== 'verified' || event.status !== 'active') throw new ListingUnavailableError();
    // Transfer-mode tickets need the seller's transfer step, which manual payments do not model yet.
    if (listing.deliveryMode !== 'file') throw new ValidationError('Manual approval supports file tickets only');
    if (!order.providerRef) throw new Error(`Order ${order.id} has no payment reference`);
    await applyTransition(tx, order, 'MANUAL_APPROVED', {
      action: 'order.manual_approved',
      actorId: actor.userId,
      detail: { method: order.paymentMethod, ref: order.providerRef, approvedAt: now.toISOString(), listingId: listing.id },
    });
    await tx.update(listings).set({ status: 'sold' }).where(eq(listings.id, listing.id));
    await appendSaleEntries(tx, order, order.providerRef);
  });
}

/** An admin (2FA) rejects the receipt: the order is cancelled (nothing was charged) and the listing is free again. */
export async function rejectManualPayment(db: Db, actor: Actor, orderId: string, reason: string): Promise<void> {
  assertAdmin(actor);
  const clean = reason.trim();
  if (clean.length < 1 || clean.length > 500) throw new ValidationError('Reason is required (max 500 chars)');
  const { listingId } = await manualOrderRef(db, orderId);
  await db.transaction(async (tx) => {
    const { order } = await lockManualOrder(tx, orderId, listingId);
    await applyTransition(tx, order, 'MANUAL_REJECTED', {
      action: 'order.manual_rejected',
      actorId: actor.userId,
      detail: { method: order.paymentMethod, ref: order.providerRef, reason: clean },
    });
  });
}

/** Money arrived for an order that can no longer be fulfilled: record it and give it back. */
async function refundUnfulfillablePayment(tx: Tx, gw: PaymentGateway, order: Order, providerRef: string) {
  // Called while holding the order lock; a failure rolls everything back and the provider retries.
  const { refundRef } = await gw.refund(providerRef, order.priceCents);
  await appendEntry(tx, { orderId: order.id, kind: 'charge', amountCents: order.priceCents, ref: providerRef });
  await appendEntry(tx, { orderId: order.id, kind: 'refund', amountCents: -order.priceCents, ref: refundRef });
  await audit(tx, {
    actorId: null,
    action: 'order.late_payment_refunded',
    entity: 'order',
    entityId: order.id,
    detail: { providerRef, refundRef, amountCents: order.priceCents, state: 'cancelada' },
  });
}

export async function applyTransition(
  tx: Tx,
  order: { id: string; state: OrderState },
  event: OrderEvent,
  o: { action: string; actorId?: string | null; set?: Partial<typeof orders.$inferInsert>; detail?: object },
): Promise<OrderState> {
  const to = transition(order.state, event);
  const updated = await tx
    .update(orders)
    .set({ ...o.set, state: to })
    .where(and(eq(orders.id, order.id), eq(orders.state, order.state)))
    .returning({ id: orders.id });
  if (updated.length !== 1) throw new Error(`Order ${order.id} is no longer ${order.state}`);
  await audit(tx, {
    actorId: o.actorId ?? null,
    action: o.action,
    entity: 'order',
    entityId: order.id,
    detail: { ...o.detail, from: order.state, to, event },
  });
  return to;
}

async function lockListing(tx: Tx, id: string): Promise<Listing | undefined> {
  const [l] = await tx.select().from(listings).where(eq(listings.id, id)).for('update');
  return l;
}

async function lockOrder(tx: Tx, id: string): Promise<Order> {
  const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
  if (!o) throw new Error(`Order ${id} not found`);
  return o;
}

async function getEvent(tx: Tx, id: string): Promise<Event> {
  const [e] = await tx.select().from(events).where(eq(events.id, id));
  if (!e) throw new Error(`Event ${id} not found`);
  return e;
}

async function hasCharge(tx: Tx, orderId: string): Promise<boolean> {
  const [c] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orderId, orderId), eq(ledgerEntries.kind, 'charge')))
    .limit(1);
  return Boolean(c);
}

function isStale(o: { createdAt: Date }, now: Date): boolean {
  return now.getTime() - o.createdAt.getTime() > CHECKOUT_TTL_MS;
}

/** Postgres unique_violation (23505) on `constraint`; drivers nest it in `cause`. */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  for (let c: unknown = e, depth = 0; c && depth < 5; c = (c as { cause?: unknown }).cause, depth++) {
    const err = c as { code?: unknown; constraint?: unknown };
    if (err.code === '23505' && err.constraint === constraint) return true;
  }
  return false;
}
