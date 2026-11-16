import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { events, listings, orders, payouts, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { openDispute } from '@/lib/disputes/disputes';
import { DAY, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { newUser, seedListing } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { buyerOrders, eventDetail, listingOffer, profileOf, sellerListings, sellerSales, upcomingEvents } from './queries';

let db: Db;
const gw = new FakeGateway('acct-secret');
beforeEach(async () => {
  db = await makeTestDb();
});

describe('upcomingEvents', () => {
  it('lists active future events with the cheapest verified price and the count, soonest first', async () => {
    const a = await seedListing(db, { askCents: 9000, startsAt: new Date(Date.now() + 5 * DAY) });
    await db.insert(listings).values({ sellerId: a.seller.id, eventId: a.event.id, askCents: 7000, deliveryMode: 'transfer', status: 'verified', fingerprint: 'x2', proofPath: 'p' });
    await db.insert(listings).values({ sellerId: a.seller.id, eventId: a.event.id, askCents: 1000, deliveryMode: 'transfer', status: 'pending', fingerprint: 'x3', proofPath: 'p' });
    const later = await seedListing(db, { askCents: 4000, startsAt: new Date(Date.now() + 9 * DAY) });

    const rows = await upcomingEvents(db);
    expect(rows.map((r) => r.id)).toEqual([a.event.id, later.event.id]);
    expect(rows[0]).toMatchObject({ fromCents: 7000, listingCount: 2, name: 'Concierto', faceValueCents: 5000, allowsTransfer: true });
  });

  it('hides cancelled and past events, and shows an event with no listings (price null, count 0)', async () => {
    await seedListing(db, { eventStatus: 'cancelled' });
    await seedListing(db, { startsAt: new Date(Date.now() - DAY) });
    const [ev] = await db.insert(events).values({ name: 'Vacío', venue: 'V', lat: 0, lng: 0, radiusM: 100, startsAt: new Date(Date.now() + DAY), faceValueCents: 1000 }).returning();
    const rows = await upcomingEvents(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ev.id, fromCents: null, listingCount: 0 });
  });
});

describe('eventDetail', () => {
  it('returns the public event fields, or null for unknown / non-uuid ids', async () => {
    const a = await seedListing(db);
    expect(await eventDetail(db, a.event.id)).toMatchObject({ id: a.event.id, resaleProhibited: false, allowsTransfer: true, status: 'active' });
    expect(await eventDetail(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await eventDetail(db, 'not-a-uuid')).toBeNull();
  });
});

describe('buyerOrders', () => {
  it("lists only the buyer's orders, newest first, with event, state, deadline and dispute flag", async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'transfer' });
    const b = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await openDispute(db, b.buyer.id, b.order.id, 'No sirvió', []);

    const mine = await buyerOrders(db, a.buyer.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ orderId: a.order.id, state: 'transferencia_pendiente', priceCents: 5000, eventName: 'Concierto', deliveryMode: 'transfer', hasOpenDispute: false });
    expect(mine[0].transferDeadline).toBeInstanceOf(Date);
    expect((await buyerOrders(db, b.buyer.id))[0]).toMatchObject({ state: 'disputada', hasOpenDispute: true });
    expect(await buyerOrders(db, (await newUser(db)).id)).toEqual([]);
  });
});

describe('sellerListings / sellerSales', () => {
  it("shows the seller's listings with status, and sales with the net amount and payout status", async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    const l = await sellerListings(db, a.seller.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ listingId: a.listing.id, status: 'sold', askCents: 5000, eventName: 'Concierto' });

    await db.update(orders).set({ state: 'liberada' }).where(eq(orders.id, a.order.id));
    await db.insert(payouts).values({ orderId: a.order.id, sellerId: a.seller.id, amountCents: 4500 });
    const s = await sellerSales(db, a.seller.id);
    expect(s).toEqual([
      expect.objectContaining({ orderId: a.order.id, state: 'liberada', netCents: 4500, payoutStatus: 'queued', eventName: 'Concierto' }),
    ]);
  });

  it('a sale with no payout row yet has payoutStatus null, and other sellers see nothing', async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    expect((await sellerSales(db, a.seller.id))[0].payoutStatus).toBeNull();
    expect(await sellerSales(db, (await newUser(db)).id)).toEqual([]);
  });
});

describe('profileOf', () => {
  it('returns the phone and identity status, null when unknown', async () => {
    const u = await newUser(db);
    await db.update(users).set({ identityStatus: 'pending' }).where(eq(users.id, u.id));
    expect(await profileOf(db, u.id)).toEqual({ userId: u.id, phone: u.phone, identityStatus: 'pending' });
    expect(await profileOf(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('listingOffer', () => {
  it('returns a verified listing of an active future event for the buy page', async () => {
    const a = await seedListing(db, { askCents: 9000 });
    expect(await listingOffer(db, a.listing.id)).toMatchObject({
      listingId: a.listing.id,
      askCents: 9000,
      deliveryMode: 'transfer',
      eventName: 'Concierto',
      sellerId: a.seller.id,
      resaleProhibited: false,
    });
  });

  it.each([
    ['pending', { status: 'pending' as const }],
    ['sold', { status: 'sold' as const }],
    ['withdrawn', { status: 'withdrawn' as const }],
    ['of a cancelled event', { eventStatus: 'cancelled' as const }],
    ['of a past event', { startsAt: new Date(Date.now() - DAY) }],
  ])('is null for a listing that is %s', async (_n, o) => {
    const a = await seedListing(db, o);
    expect(await listingOffer(db, a.listing.id)).toBeNull();
  });

  it('is null for unknown or malformed ids', async () => {
    expect(await listingOffer(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await listingOffer(db, "x' or 1=1 --")).toBeNull();
  });
});
