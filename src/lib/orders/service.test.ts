import { beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, events, ledgerEntries, listings, orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { InvalidWebhookError, type PaymentWebhook } from '@/lib/payments/gateway';
import {
  AmountMismatchError,
  CHECKOUT_TTL_MS,
  ListingUnavailableError,
  SelfPurchaseError,
  UnknownPaymentError,
  abandonStaleCheckouts,
  handlePaymentWebhook,
  startCheckout,
} from './service';
import { newUser, seedListing } from './test-fixtures';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

let db: Db;
let gw: FakeGateway;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('service-secret');
});

const getOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const getListing = async (id: string) => (await db.select().from(listings).where(eq(listings.id, id)))[0];
const ledgerOf = (orderId: string) =>
  db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId)).orderBy(asc(ledgerEntries.createdAt));
const auditOf = (orderId: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'order'), eq(auditLog.entityId, orderId)))
    .orderBy(asc(auditLog.createdAt));

function deliver(w: Partial<PaymentWebhook> & { providerRef: string }, now?: Date) {
  const { rawBody, headers } = gw.buildWebhook({ status: 'paid', amountCents: 5000, ...w });
  return handlePaymentWebhook(db, gw, rawBody, headers, now);
}

describe('startCheckout', () => {
  it('creates a creada order with price, 10% fee and the gateway providerRef; the listing stays verified', async () => {
    const { buyer, listing } = await seedListing(db, { askCents: 5000 });
    const res = await startCheckout(db, gw, buyer.id, listing.id);

    expect(res.checkoutUrl).toBe((await gw.createCheckout({ orderId: res.orderId, amountCents: 5000 })).checkoutUrl);
    const order = await getOrder(res.orderId);
    expect(order).toMatchObject({
      state: 'creada',
      buyerId: buyer.id,
      listingId: listing.id,
      priceCents: 5000,
      feeCents: 500,
      providerRef: `fake_${res.orderId}`,
      transferDeadline: null,
    });
    expect((await getListing(listing.id)).status).toBe('verified');
    expect(await ledgerOf(res.orderId)).toHaveLength(0);
    const audits = await auditOf(res.orderId);
    expect(audits[0]).toMatchObject({ action: 'order.created', actorId: buyer.id });
  });

  it('rejects the seller buying their own listing', async () => {
    const { seller, listing } = await seedListing(db);
    await expect(startCheckout(db, gw, seller.id, listing.id)).rejects.toBeInstanceOf(SelfPurchaseError);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it.each(['pending', 'rejected', 'sold', 'withdrawn'] as const)('rejects a %s listing', async (status) => {
    const { buyer, listing } = await seedListing(db, { status });
    await expect(startCheckout(db, gw, buyer.id, listing.id)).rejects.toBeInstanceOf(ListingUnavailableError);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it('rejects an unknown listing', async () => {
    const buyer = await newUser(db);
    await expect(
      startCheckout(db, gw, buyer.id, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(ListingUnavailableError);
  });

  it('rejects a listing whose event was cancelled or already started', async () => {
    const cancelled = await seedListing(db, { eventStatus: 'cancelled' });
    await expect(startCheckout(db, gw, cancelled.buyer.id, cancelled.listing.id)).rejects.toBeInstanceOf(
      ListingUnavailableError,
    );
    const started = await seedListing(db, { startsAt: new Date(Date.now() - MIN) });
    await expect(startCheckout(db, gw, started.buyer.id, started.listing.id)).rejects.toBeInstanceOf(
      ListingUnavailableError,
    );
  });

  it('two simultaneous checkouts on the same listing: exactly one succeeds', async () => {
    const { buyer, listing } = await seedListing(db);
    const other = await newUser(db);
    const results = await Promise.allSettled([
      startCheckout(db, gw, buyer.id, listing.id),
      startCheckout(db, gw, other.id, listing.id),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ListingUnavailableError);
    expect(await db.select().from(orders).where(eq(orders.listingId, listing.id))).toHaveLength(1);
  });

  it('many simultaneous checkouts (including a repeat buyer): exactly one order', async () => {
    const { buyer, listing } = await seedListing(db);
    const buyers = [buyer.id, buyer.id, ...(await Promise.all([1, 2, 3].map(() => newUser(db)))).map((u) => u.id)];
    const results = await Promise.allSettled(buyers.map((b) => startCheckout(db, gw, b, listing.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ListingUnavailableError);
    expect(await db.select().from(orders).where(eq(orders.listingId, listing.id))).toHaveLength(1);
  });

  it('maps a violation of the one-live-order-per-listing index to ListingUnavailableError', async () => {
    // Inconsistent data the pre-checks do not look for: a paid order on a still-verified listing.
    const { buyer, listing } = await seedListing(db);
    await db
      .insert(orders)
      .values({ listingId: listing.id, buyerId: buyer.id, state: 'disputada', priceCents: 5000, feeCents: 500 });
    const other = await newUser(db);
    await expect(startCheckout(db, gw, other.id, listing.id)).rejects.toBeInstanceOf(ListingUnavailableError);
    expect(await db.select().from(orders).where(eq(orders.listingId, listing.id))).toHaveLength(1);
  });

  it('a live creada order younger than 15 minutes holds the listing', async () => {
    const t0 = new Date();
    const { buyer, listing } = await seedListing(db);
    await startCheckout(db, gw, buyer.id, listing.id, t0);
    const other = await newUser(db);
    await expect(
      startCheckout(db, gw, other.id, listing.id, new Date(t0.getTime() + 14 * MIN)),
    ).rejects.toBeInstanceOf(ListingUnavailableError);
  });

  it('a creada order older than 15 minutes is abandoned so a new buyer can check out', async () => {
    const t0 = new Date();
    const { buyer, listing } = await seedListing(db);
    const first = await startCheckout(db, gw, buyer.id, listing.id, t0);
    const other = await newUser(db);
    const second = await startCheckout(db, gw, other.id, listing.id, new Date(t0.getTime() + CHECKOUT_TTL_MS + 1));

    expect((await getOrder(first.orderId)).state).toBe('cancelada');
    expect((await getOrder(second.orderId)).state).toBe('creada');
    const audits = await auditOf(first.orderId);
    expect(audits.at(-1)).toMatchObject({
      action: 'order.checkout_abandoned',
      actorId: null,
      detail: { from: 'creada', to: 'cancelada' },
    });

    // The first buyer pays late: refunded, and the second buyer's order is untouched.
    await deliver({ providerRef: `fake_${first.orderId}` });
    expect(gw.refunds).toHaveLength(1);
    expect((await getOrder(second.orderId)).state).toBe('creada');
    expect((await getListing(listing.id)).status).toBe('verified');
  });

  it('cancels the order and frees the listing when the gateway fails to create the checkout', async () => {
    const { buyer, listing } = await seedListing(db);
    const broken = new FakeGateway('service-secret');
    broken.createCheckout = async () => {
      throw new Error('gateway down');
    };
    await expect(startCheckout(db, broken, buyer.id, listing.id)).rejects.toThrow('gateway down');
    const [order] = await db.select().from(orders).where(eq(orders.listingId, listing.id));
    expect(order.state).toBe('cancelada');
    expect((await auditOf(order.id)).at(-1)).toMatchObject({ action: 'order.checkout_failed', actorId: null });
    // Listing is purchasable again.
    await expect(startCheckout(db, gw, buyer.id, listing.id)).resolves.toBeDefined();
  });
});

describe('handlePaymentWebhook', () => {
  it('paid (transfer): creada -> transferencia_pendiente, deadline = paid + 2h, listing sold, ledger and audit', async () => {
    const { buyer, listing } = await seedListing(db, { deliveryMode: 'transfer' });
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    const paidAt = new Date();
    await deliver({ providerRef: `fake_${orderId}` }, paidAt);

    const order = await getOrder(orderId);
    expect(order.state).toBe('transferencia_pendiente');
    expect(order.transferDeadline?.getTime()).toBe(paidAt.getTime() + 2 * HOUR);
    expect((await getListing(listing.id)).status).toBe('sold');
    expect((await ledgerOf(orderId)).map((e) => [e.kind, e.amountCents]).sort()).toEqual(
      [
        ['charge', 5000],
        ['fee', -500],
        ['seller_due', 4500],
      ].sort(),
    );
    expect((await auditOf(orderId)).at(-1)).toMatchObject({
      action: 'order.paid',
      actorId: null,
      detail: { from: 'creada', to: 'transferencia_pendiente' },
    });
  });

  it('transfer deadline is the event start when the event starts in less than 2 hours', async () => {
    const paidAt = new Date();
    const startsAt = new Date(paidAt.getTime() + 90 * MIN);
    const { buyer, listing } = await seedListing(db, { deliveryMode: 'transfer', startsAt });
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id, new Date(paidAt.getTime() - MIN));
    await deliver({ providerRef: `fake_${orderId}` }, paidAt);
    expect((await getOrder(orderId)).transferDeadline?.getTime()).toBe(startsAt.getTime());
  });

  it('paid (file): creada -> entrada_recibida without transfer deadline', async () => {
    const { buyer, listing } = await seedListing(db, { deliveryMode: 'file' });
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await deliver({ providerRef: `fake_${orderId}` });
    const order = await getOrder(orderId);
    expect(order.state).toBe('entrada_recibida');
    expect(order.transferDeadline).toBeNull();
    expect((await getListing(listing.id)).status).toBe('sold');
  });

  it('the same paid webhook delivered twice: one charge entry and one transition', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await deliver({ providerRef: `fake_${orderId}` });
    await deliver({ providerRef: `fake_${orderId}` });

    const ledger = await ledgerOf(orderId);
    expect(ledger.filter((e) => e.kind === 'charge')).toHaveLength(1);
    expect(ledger).toHaveLength(3);
    expect((await auditOf(orderId)).filter((a) => a.action === 'order.paid')).toHaveLength(1);
    expect((await getOrder(orderId)).state).toBe('transferencia_pendiente');
  });

  it('the same paid webhook delivered concurrently: one charge entry and one transition', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await Promise.all([
      deliver({ providerRef: `fake_${orderId}` }),
      deliver({ providerRef: `fake_${orderId}` }),
      deliver({ providerRef: `fake_${orderId}` }),
    ]);
    const ledger = await ledgerOf(orderId);
    expect(ledger.filter((e) => e.kind === 'charge')).toHaveLength(1);
    expect(ledger).toHaveLength(3);
    expect((await auditOf(orderId)).filter((a) => a.action === 'order.paid')).toHaveLength(1);
  });

  it('paid after CHECKOUT_ABANDONED: recorded and refunded once, order stays cancelada', async () => {
    const t0 = new Date();
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id, t0);
    expect(await abandonStaleCheckouts(db, new Date(t0.getTime() + 16 * MIN))).toBe(1);
    expect((await getOrder(orderId)).state).toBe('cancelada');

    await deliver({ providerRef: `fake_${orderId}` });
    await deliver({ providerRef: `fake_${orderId}` }); // replay

    expect(gw.refunds).toEqual([
      { providerRef: `fake_${orderId}`, amountCents: 5000, refundRef: `fake_refund_fake_${orderId}` },
    ]);
    const ledger = await ledgerOf(orderId);
    expect(ledger.map((e) => [e.kind, e.amountCents, e.ref]).sort()).toEqual(
      [
        ['charge', 5000, `fake_${orderId}`],
        ['refund', -5000, `fake_refund_fake_${orderId}`],
      ].sort(),
    );
    expect((await getOrder(orderId)).state).toBe('cancelada');
    expect((await getListing(listing.id)).status).toBe('verified');
    const refundAudits = (await auditOf(orderId)).filter((a) => a.action === 'order.late_payment_refunded');
    expect(refundAudits).toHaveLength(1);
    expect(refundAudits[0]).toMatchObject({ actorId: null, detail: { amountCents: 5000, state: 'cancelada' } });
  });

  it('paid after the event was cancelled: order cancelled and payment refunded, listing not sold', async () => {
    const { buyer, listing, event } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, event.id));
    await deliver({ providerRef: `fake_${orderId}` });

    expect((await getOrder(orderId)).state).toBe('cancelada');
    expect(gw.refunds).toHaveLength(1);
    expect((await getListing(listing.id)).status).toBe('verified');
    expect((await ledgerOf(orderId)).map((e) => e.kind).sort()).toEqual(['charge', 'refund']);
  });

  it('paid after the listing was withdrawn: order cancelled and payment refunded', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await db.update(listings).set({ status: 'withdrawn' }).where(eq(listings.id, listing.id));
    await deliver({ providerRef: `fake_${orderId}` });
    expect((await getOrder(orderId)).state).toBe('cancelada');
    expect(gw.refunds).toHaveLength(1);
    expect((await getListing(listing.id)).status).toBe('withdrawn');
  });

  it('rejects an invalid signature without touching the order', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    const { rawBody } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    const forged = new FakeGateway('attacker-secret').sign(rawBody);
    await expect(
      handlePaymentWebhook(db, gw, rawBody, { 'x-fake-signature': forged }),
    ).rejects.toBeInstanceOf(InvalidWebhookError);
    expect((await getOrder(orderId)).state).toBe('creada');
    expect(await ledgerOf(orderId)).toHaveLength(0);
  });

  it('rejects an amount that differs from the order price without any state change', async () => {
    const { buyer, listing } = await seedListing(db, { askCents: 5000 });
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await expect(deliver({ providerRef: `fake_${orderId}`, amountCents: 100 })).rejects.toBeInstanceOf(
      AmountMismatchError,
    );
    expect((await getOrder(orderId)).state).toBe('creada');
    expect((await getListing(listing.id)).status).toBe('verified');
    expect(await ledgerOf(orderId)).toHaveLength(0);
    expect((await auditOf(orderId)).at(-1)).toMatchObject({
      action: 'payment.amount_mismatch',
      actorId: null,
      detail: { expectedCents: 5000, receivedCents: 100 },
    });
  });

  it('rejects an unknown providerRef', async () => {
    await expect(deliver({ providerRef: 'fake_nope' })).rejects.toBeInstanceOf(UnknownPaymentError);
  });

  it('failed: creada -> cancelada, the listing can be bought again, replay is a no-op', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await deliver({ providerRef: `fake_${orderId}`, status: 'failed' });
    await deliver({ providerRef: `fake_${orderId}`, status: 'failed' });

    expect((await getOrder(orderId)).state).toBe('cancelada');
    expect((await auditOf(orderId)).filter((a) => a.action === 'order.payment_failed')).toHaveLength(1);
    expect(await ledgerOf(orderId)).toHaveLength(0);
    const other = await newUser(db);
    await expect(startCheckout(db, gw, other.id, listing.id)).resolves.toBeDefined();
  });

  it('a failed webhook after the payment was confirmed changes nothing', async () => {
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    await deliver({ providerRef: `fake_${orderId}` });
    await deliver({ providerRef: `fake_${orderId}`, status: 'failed' });
    expect((await getOrder(orderId)).state).toBe('transferencia_pendiente');
    expect((await getListing(listing.id)).status).toBe('sold');
    expect(await ledgerOf(orderId)).toHaveLength(3);
  });
});

describe('abandonStaleCheckouts', () => {
  it('cancels only creada orders older than 15 minutes, with audit, and is idempotent', async () => {
    const t0 = new Date();
    const stale = await seedListing(db);
    const fresh = await seedListing(db);
    const paid = await seedListing(db);
    const a = await startCheckout(db, gw, stale.buyer.id, stale.listing.id, t0);
    const b = await startCheckout(db, gw, fresh.buyer.id, fresh.listing.id, new Date(t0.getTime() + 10 * MIN));
    const c = await startCheckout(db, gw, paid.buyer.id, paid.listing.id, t0);
    await deliver({ providerRef: `fake_${c.orderId}` });

    const now = new Date(t0.getTime() + 16 * MIN);
    expect(await abandonStaleCheckouts(db, now)).toBe(1);
    expect(await abandonStaleCheckouts(db, now)).toBe(0);

    expect((await getOrder(a.orderId)).state).toBe('cancelada');
    expect((await getOrder(b.orderId)).state).toBe('creada');
    expect((await getOrder(c.orderId)).state).toBe('transferencia_pendiente');
    const audits = (await auditOf(a.orderId)).filter((x) => x.action === 'order.checkout_abandoned');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: null, detail: { from: 'creada', to: 'cancelada' } });
  });

  it('does not abandon an order exactly 15 minutes old', async () => {
    const t0 = new Date();
    const s = await seedListing(db);
    await startCheckout(db, gw, s.buyer.id, s.listing.id, t0);
    expect(await abandonStaleCheckouts(db, new Date(t0.getTime() + CHECKOUT_TTL_MS))).toBe(0);
  });
});
