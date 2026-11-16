import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, events, ledgerEntries, listings, orders, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { openDispute, resolveDispute } from '@/lib/disputes/disputes';
import { confirmEntry } from '@/lib/entry/confirmation';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { sellerPendingCents } from '@/lib/orders/ledger';
import { DAY, HOUR, MIN, auditOf, disputesOf, filePath, getOrder, ledgerOf } from '@/lib/orders/paid-order-fixture';
import { applyTransition, handlePaymentWebhook, ListingUnavailableError, startCheckout } from '@/lib/orders/service';
import type { OrderState } from '@/lib/orders/state-machine';
import { newUser } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import type { PaymentGateway } from '@/lib/payments/gateway';
import { cancelEvent } from './events';

const STARTS = new Date('2026-12-01T20:00:00Z');
const at = (msFromStart: number) => new Date(STARTS.getTime() + msFromStart);
const CANCEL_AT = at(-30 * MIN);
const PRICE = 5000;

type ListingStatus = (typeof listings.$inferSelect)['status'];
type Seedable = Exclude<OrderState, 'cancelada'>;

let db: Db;
let gw: FakeGateway;
let admin: Actor;

beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('cancel-secret');
  const u = await newUser(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, u.id));
  admin = { userId: u.id, role: 'admin', mfa: true };
});

async function seedEvent() {
  const [event] = await db
    .insert(events)
    .values({ name: 'Concierto', venue: 'Atlapa', lat: 9, lng: -79.5, radiusM: 500, startsAt: STARTS, faceValueCents: PRICE })
    .returning();
  return event;
}

async function seedListingOn(eventId: string, o: { status?: ListingStatus; deliveryMode?: 'transfer' | 'file' } = {}) {
  const seller = await newUser(db);
  const [listing] = await db
    .insert(listings)
    .values({
      sellerId: seller.id,
      eventId,
      askCents: PRICE,
      deliveryMode: o.deliveryMode ?? 'file',
      status: o.status ?? 'verified',
      fingerprint: `fp-${randomUUID()}`,
      proofPath: 'proofs/p.png',
    })
    .returning();
  return { seller, listing };
}

/** A sale on `eventId` driven through the real flows until it reaches `state`. */
async function seedOrderOn(eventId: string, state: Seedable) {
  const { seller, listing } = await seedListingOn(eventId, {
    deliveryMode: state === 'transferencia_pendiente' ? 'transfer' : 'file',
  });
  const buyer = await newUser(db);
  const { orderId } = await startCheckout(db, gw, buyer.id, listing.id, at(-2 * DAY));
  if (state !== 'creada') await pay(orderId, at(-DAY));
  if (state === 'ingreso_confirmado') {
    const photoPath = filePath('proof', buyer.id);
    await confirmEntry(db, buyer.id, orderId, { lat: 9, lng: -79.5, photoPath }, at(-HOUR));
  }
  if (['disputada', 'liberada', 'liquidada', 'reembolsada'].includes(state)) {
    const { disputeId } = await openDispute(db, buyer.id, orderId, 'No me transfirió', [], at(-2 * HOUR));
    if (state === 'liberada' || state === 'liquidada') {
      await resolveDispute(db, gw, admin, disputeId, 'release', at(-HOUR));
    }
    if (state === 'reembolsada') await resolveDispute(db, gw, admin, disputeId, 'refund', at(-HOUR));
  }
  if (state === 'liquidada') {
    // Task 10 pays sellers out; until then the transition is applied directly.
    await db.transaction((tx) =>
      applyTransition(tx, { id: orderId, state: 'liberada' }, 'PAYOUT_DONE', { action: 'test.payout_done' }),
    );
  }
  const order = await getOrder(db, orderId);
  expect(order.state).toBe(state);
  return { seller, buyer, listing, order };
}

async function pay(orderId: string, paidAt: Date) {
  const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: PRICE });
  await handlePaymentWebhook(db, gw, rawBody, headers, paidAt);
}

const eventAudits = (eventId: string) =>
  db.select().from(auditLog).where(and(eq(auditLog.entity, 'event'), eq(auditLog.entityId, eventId)));

const listingAudits = (listingId: string) =>
  db.select().from(auditLog).where(and(eq(auditLog.entity, 'listing'), eq(auditLog.entityId, listingId)));

const refundEntries = (orderId: string) =>
  db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orderId, orderId), eq(ledgerEntries.kind, 'refund')));

const listingStatus = async (id: string) => (await db.select().from(listings).where(eq(listings.id, id)))[0].status;
const eventStatus = async (id: string) => (await db.select().from(events).where(eq(events.id, id)))[0].status;

const ZERO = { refunded: 0, manualReview: 0, abandoned: 0, withdrawn: 0, failed: 0 };

describe('cancelEvent: refunds', () => {
  it('refunds the 4 paid orders (transferencia_pendiente, entrada_recibida, liberada, disputada) exactly once', async () => {
    const event = await seedEvent();
    const states = ['transferencia_pendiente', 'entrada_recibida', 'liberada', 'disputada'] as const;
    const seeded = [];
    for (const s of states) seeded.push(await seedOrderOn(event.id, s));
    for (const { seller } of seeded) expect(await sellerPendingCents(db, seller.id)).toBe(PRICE - 500);
    expect(gw.refunds).toHaveLength(0);

    const result = await cancelEvent(db, gw, admin, event.id, CANCEL_AT);

    expect(result).toEqual({ ...ZERO, refunded: 4 });
    expect(await eventStatus(event.id)).toBe('cancelled');
    expect(gw.refunds).toHaveLength(4);
    expect(gw.refunds.map((r) => r.providerRef).sort()).toEqual(seeded.map((x) => `fake_${x.order.id}`).sort());
    for (const r of gw.refunds) expect(r.amountCents).toBe(PRICE);

    for (const { order, seller } of seeded) {
      expect((await getOrder(db, order.id)).state).toBe('reembolsada');
      const refunds = await refundEntries(order.id);
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ amountCents: -PRICE, ref: `fake_refund_fake_${order.id}` });
      expect(await sellerPendingCents(db, seller.id)).toBe(0);

      const audits = await auditOf(db, order.id);
      expect(audits.filter((a) => a.action === 'order.event_cancelled')).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          detail: expect.objectContaining({ eventId: event.id, to: 'reembolsada', event: 'EVENT_CANCELLED' }),
        }),
      ]);
      expect(audits.filter((a) => a.action === 'order.refunded')).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          detail: expect.objectContaining({ amountCents: PRICE, cause: 'EVENT_CANCELLED' }),
        }),
      ]);
    }

    // The open dispute of the disputada order is closed in the same transaction.
    const disputed = seeded[3].order;
    const [d] = await disputesOf(db, disputed.id);
    expect(d).toMatchObject({ status: 'refunded', resolvedBy: admin.userId });
    expect(d.resolvedAt?.toISOString()).toBe(CANCEL_AT.toISOString());
    expect((await auditOf(db, disputed.id)).filter((a) => a.action === 'dispute.closed')).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        detail: expect.objectContaining({ disputeId: d.id, status: 'refunded', cause: 'EVENT_CANCELLED' }),
      }),
    ]);
    // The liberada order's dispute was already resolved (released) and stays as it was.
    expect((await disputesOf(db, seeded[2].order.id))[0].status).toBe('released');

    expect(await eventAudits(event.id)).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        action: 'event.cancelled',
        detail: expect.objectContaining({ from: 'active' }),
      }),
    ]);
  });

  it('refunds an ingreso_confirmado order too', async () => {
    const event = await seedEvent();
    const { order } = await seedOrderOn(event.id, 'ingreso_confirmado');
    expect(await cancelEvent(db, gw, admin, event.id, CANCEL_AT)).toEqual({ ...ZERO, refunded: 1 });
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect(gw.refunds).toHaveLength(1);
  });

  it('a liquidada order (seller already paid) is not refunded by the gateway: flagged for manual review', async () => {
    const event = await seedEvent();
    const { order, seller } = await seedOrderOn(event.id, 'liquidada');

    const result = await cancelEvent(db, gw, admin, event.id, CANCEL_AT);

    expect(result).toEqual({ ...ZERO, manualReview: 1 });
    expect(gw.refunds).toHaveLength(0);
    const after = await getOrder(db, order.id);
    expect(after).toMatchObject({ state: 'liquidada', needsManualReview: true });
    expect(await refundEntries(order.id)).toHaveLength(0);
    expect(await sellerPendingCents(db, seller.id)).toBe(0);
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'order.manual_review_required')).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        detail: expect.objectContaining({ eventId: event.id, state: 'liquidada', cause: 'EVENT_CANCELLED' }),
      }),
    ]);
  });

  it('an order refunded before the cancellation is not refunded again', async () => {
    const event = await seedEvent();
    const { order } = await seedOrderOn(event.id, 'reembolsada');
    expect(gw.refunds).toHaveLength(1);

    expect(await cancelEvent(db, gw, admin, event.id, CANCEL_AT)).toEqual(ZERO);
    expect(gw.refunds).toHaveLength(1);
    expect(await refundEntries(order.id)).toHaveLength(1);
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
  });

  it('an unpaid creada order is cancelled (abandoned); a late payment for it is refunded by the webhook', async () => {
    const event = await seedEvent();
    const { order, listing } = await seedOrderOn(event.id, 'creada');

    expect(await cancelEvent(db, gw, admin, event.id, CANCEL_AT)).toEqual({ ...ZERO, abandoned: 1, withdrawn: 1 });
    expect((await getOrder(db, order.id)).state).toBe('cancelada');
    expect(await listingStatus(listing.id)).toBe('withdrawn');
    expect(gw.refunds).toHaveLength(0);
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'order.cancelled_by_event')).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        detail: expect.objectContaining({ eventId: event.id, from: 'creada', to: 'cancelada' }),
      }),
    ]);

    await pay(order.id, CANCEL_AT);
    expect((await getOrder(db, order.id)).state).toBe('cancelada');
    expect(gw.refunds).toHaveLength(1);
    expect((await ledgerOf(db, order.id)).map((e) => e.kind).sort()).toEqual(['charge', 'refund']);
  });
});

describe('cancelEvent: listings and new sales', () => {
  it('withdraws pending and verified listings; sold, rejected and withdrawn ones are left alone', async () => {
    const event = await seedEvent();
    const pending = (await seedListingOn(event.id, { status: 'pending' })).listing;
    const verified = (await seedListingOn(event.id, { status: 'verified' })).listing;
    const rejected = (await seedListingOn(event.id, { status: 'rejected' })).listing;
    const withdrawn = (await seedListingOn(event.id, { status: 'withdrawn' })).listing;
    const sold = (await seedOrderOn(event.id, 'entrada_recibida')).listing;
    expect(await listingStatus(sold.id)).toBe('sold');
    // A listing of another event is never touched.
    const otherEvent = await seedEvent();
    const other = (await seedListingOn(otherEvent.id, { status: 'verified' })).listing;

    const result = await cancelEvent(db, gw, admin, event.id, CANCEL_AT);

    expect(result).toEqual({ ...ZERO, refunded: 1, withdrawn: 2 });
    expect(await listingStatus(pending.id)).toBe('withdrawn');
    expect(await listingStatus(verified.id)).toBe('withdrawn');
    expect(await listingStatus(rejected.id)).toBe('rejected');
    expect(await listingStatus(withdrawn.id)).toBe('withdrawn');
    expect(await listingStatus(sold.id)).toBe('sold');
    expect(await listingStatus(other.id)).toBe('verified');
    expect(await eventStatus(otherEvent.id)).toBe('active');

    for (const [l, from] of [
      [pending, 'pending'],
      [verified, 'verified'],
    ] as const) {
      expect(await listingAudits(l.id)).toEqual([
        expect.objectContaining({
          actorId: admin.userId,
          action: 'listing.withdrawn',
          detail: expect.objectContaining({ eventId: event.id, from, cause: 'event_cancelled' }),
        }),
      ]);
    }
    for (const l of [rejected, withdrawn, sold]) expect(await listingAudits(l.id)).toHaveLength(0);
  });

  it('a new checkout on a cancelled event is rejected, even for a listing that is still verified', async () => {
    const event = await seedEvent();
    const { listing } = await seedListingOn(event.id);
    const buyer = await newUser(db);
    await cancelEvent(db, gw, admin, event.id, CANCEL_AT);

    await expect(startCheckout(db, gw, buyer.id, listing.id, CANCEL_AT)).rejects.toBeInstanceOf(
      ListingUnavailableError,
    );
    // Even if the listing were verified again, the event status alone blocks the sale.
    await db.update(listings).set({ status: 'verified' }).where(eq(listings.id, listing.id));
    await expect(startCheckout(db, gw, buyer.id, listing.id, CANCEL_AT)).rejects.toBeInstanceOf(
      ListingUnavailableError,
    );
    expect(await db.select().from(orders).where(eq(orders.listingId, listing.id))).toHaveLength(0);
  });
});

describe('cancelEvent: idempotency, failures and concurrency', () => {
  it('a second call is a no-op: all zeros, no new ledger rows and no gateway calls', async () => {
    const event = await seedEvent();
    const paid = await seedOrderOn(event.id, 'transferencia_pendiente');
    const settled = await seedOrderOn(event.id, 'liquidada');
    const unpaid = await seedOrderOn(event.id, 'creada');
    await seedListingOn(event.id, { status: 'verified' });

    expect(await cancelEvent(db, gw, admin, event.id, CANCEL_AT)).toEqual({
      ...ZERO,
      refunded: 1,
      manualReview: 1,
      abandoned: 1,
      withdrawn: 2,
    });
    const ledgerRows = (await db.select().from(ledgerEntries)).length;
    const orderRows = await db.select().from(orders);
    const refundCalls = gw.refunds.length;

    expect(await cancelEvent(db, gw, admin, event.id, at(-10 * MIN))).toEqual(ZERO);
    expect(gw.refunds).toHaveLength(refundCalls);
    expect(await db.select().from(ledgerEntries)).toHaveLength(ledgerRows);
    expect(await db.select().from(orders)).toEqual(orderRows);
    expect((await getOrder(db, paid.order.id)).state).toBe('reembolsada');
    expect((await getOrder(db, settled.order.id)).needsManualReview).toBe(true);
    expect((await getOrder(db, unpaid.order.id)).state).toBe('cancelada');
    expect((await auditOf(db, settled.order.id)).filter((a) => a.action === 'order.manual_review_required')).toHaveLength(1);
    // The resumed run is still audited as an admin action on the event.
    expect((await eventAudits(event.id)).map((a) => a.action).sort()).toEqual(['event.cancel_resumed', 'event.cancelled']);
  });

  it('a failing gateway refund rolls back only that order; the next call refunds the leftover', async () => {
    const event = await seedEvent();
    const ok1 = await seedOrderOn(event.id, 'entrada_recibida');
    const bad = await seedOrderOn(event.id, 'disputada');
    const ok2 = await seedOrderOn(event.id, 'transferencia_pendiente');
    const badRef = `fake_${bad.order.id}`;

    class GatewayDownError extends Error {
      constructor() {
        super(`refund of ${badRef} for +50760000000 failed`); // a message that must never be logged
        this.name = 'GatewayDownError';
      }
    }
    const flaky: PaymentGateway = {
      createCheckout: (i) => gw.createCheckout(i),
      parseWebhook: (b, h) => gw.parseWebhook(b, h),
      refund: async (ref, amount) => {
        if (ref === badRef) throw new GatewayDownError();
        return gw.refund(ref, amount);
      },
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await cancelEvent(db, flaky, admin, event.id, CANCEL_AT)).toEqual({ ...ZERO, refunded: 2, failed: 1 });
      const logged = JSON.stringify(errors.mock.calls);
      expect(logged).toContain('GatewayDownError');
      // A refund that could not be made pages an operator (RNF-10).
      expect(errors.mock.calls.map((c) => JSON.parse(String(c[0])))).toContainEqual(
        expect.objectContaining({ alert: true, msg: 'event_cancel_order_failed', ctx: { error: 'GatewayDownError', eventId: event.id, orderId: bad.order.id } }),
      );
      expect(logged).not.toContain(badRef);
      expect(logged).not.toContain('+507');
    } finally {
      errors.mockRestore();
    }

    for (const x of [ok1, ok2]) expect((await getOrder(db, x.order.id)).state).toBe('reembolsada');
    // The failing order is exactly as before: state, ledger, dispute and no refund audit.
    expect((await getOrder(db, bad.order.id)).state).toBe('disputada');
    expect(await ledgerOf(db, bad.order.id)).toHaveLength(3);
    expect((await disputesOf(db, bad.order.id))[0]).toMatchObject({ status: 'open', resolvedBy: null });
    expect(
      (await auditOf(db, bad.order.id)).filter((a) => ['order.refunded', 'order.event_cancelled', 'dispute.closed'].includes(a.action)),
    ).toHaveLength(0);
    expect(gw.refunds).toHaveLength(2);

    // The gateway recovers: only the leftover is refunded.
    expect(await cancelEvent(db, gw, admin, event.id, at(-10 * MIN))).toEqual({ ...ZERO, refunded: 1 });
    expect((await getOrder(db, bad.order.id)).state).toBe('reembolsada');
    expect((await disputesOf(db, bad.order.id))[0].status).toBe('refunded');
    expect(gw.refunds).toHaveLength(3);
    expect(gw.refunds.filter((r) => r.providerRef === badRef)).toHaveLength(1);
    for (const x of [ok1, bad, ok2]) expect(await refundEntries(x.order.id)).toHaveLength(1);
  });

  it('two simultaneous calls never refund twice and leave no orphan ledger rows', async () => {
    const event = await seedEvent();
    const paidStates = ['transferencia_pendiente', 'entrada_recibida', 'ingreso_confirmado', 'disputada', 'liberada'] as const;
    const paid = [];
    for (const s of paidStates) paid.push(await seedOrderOn(event.id, s));
    const settled = await seedOrderOn(event.id, 'liquidada');
    const unpaid = await seedOrderOn(event.id, 'creada');
    await seedListingOn(event.id, { status: 'verified' });
    const ledgerBefore = (await db.select().from(ledgerEntries)).length;

    const results = await Promise.all([
      cancelEvent(db, gw, admin, event.id, CANCEL_AT),
      cancelEvent(db, gw, admin, event.id, CANCEL_AT),
    ]);

    const sum = (k: keyof typeof ZERO) => results.reduce((n, r) => n + r[k], 0);
    expect(sum('refunded')).toBe(paid.length);
    expect(sum('manualReview')).toBe(1);
    expect(sum('abandoned')).toBe(1);
    expect(sum('withdrawn')).toBe(2);
    expect(sum('failed')).toBe(0);

    expect(gw.refunds).toHaveLength(paid.length);
    expect(new Set(gw.refunds.map((r) => r.providerRef)).size).toBe(paid.length);
    const allRefunds = await db.select().from(ledgerEntries).where(eq(ledgerEntries.kind, 'refund'));
    expect(allRefunds).toHaveLength(paid.length);
    expect((await db.select().from(ledgerEntries)).length).toBe(ledgerBefore + paid.length);
    for (const { order, seller } of paid) {
      expect((await getOrder(db, order.id)).state).toBe('reembolsada');
      expect(allRefunds.filter((e) => e.orderId === order.id)).toHaveLength(1);
      expect(await sellerPendingCents(db, seller.id)).toBe(0);
    }
    expect((await getOrder(db, settled.order.id)).needsManualReview).toBe(true);
    expect((await getOrder(db, unpaid.order.id)).state).toBe('cancelada');
  });
});

describe('cancelEvent: authorization and input', () => {
  it('requires an admin with 2FA (ForbiddenError) and changes nothing otherwise', async () => {
    const event = await seedEvent();
    const { order, listing, buyer } = await seedOrderOn(event.id, 'entrada_recibida');
    const spare = (await seedListingOn(event.id)).listing;
    for (const actor of [
      { ...admin, mfa: false },
      { userId: buyer.id, role: 'user' as const, mfa: true },
      { userId: buyer.id, role: 'user' as const, mfa: false },
    ]) {
      await expect(cancelEvent(db, gw, actor, event.id, CANCEL_AT)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await eventStatus(event.id)).toBe('active');
    expect(await listingStatus(spare.id)).toBe('verified');
    expect(await listingStatus(listing.id)).toBe('sold');
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
    expect(gw.refunds).toHaveLength(0);
    expect(await eventAudits(event.id)).toHaveLength(0);
  });

  it('an unknown event is NotFoundError', async () => {
    await expect(
      cancelEvent(db, gw, admin, '00000000-0000-4000-8000-000000000000', CANCEL_AT),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelEvent(db, gw, admin, 'not-a-uuid', CANCEL_AT)).rejects.toBeInstanceOf(NotFoundError);
  });
});
