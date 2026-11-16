import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { disputes, listings, orders, payouts, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { openDispute } from '@/lib/disputes/disputes';
import { seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { newUser, seedListing } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { allEvents, openDisputes, pendingIdentities, pendingListings, queuedPayouts } from './queries';

import type { Actor } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';

const ADMIN: Actor = { userId: '00000000-0000-4000-8000-0000000000aa', role: 'admin', mfa: true };
let db: Db;
const gw = new FakeGateway('admin-q-secret');
beforeEach(async () => {
  db = await makeTestDb();
});

describe('pendingIdentities', () => {
  it('lists only users whose identity is pending, with their stored file paths', async () => {
    const pending = await newUser(db);
    const approved = await newUser(db);
    await newUser(db); // none
    await db.update(users).set({ identityStatus: 'pending', idDocPath: `identity/${pending.id}/a`, selfiePath: `selfie/${pending.id}/b` }).where(eq(users.id, pending.id));
    await db.update(users).set({ identityStatus: 'approved' }).where(eq(users.id, approved.id));

    const rows = await pendingIdentities(db, ADMIN);
    expect(rows).toEqual([
      { userId: pending.id, phone: pending.phone, idDocPath: `identity/${pending.id}/a`, selfiePath: `selfie/${pending.id}/b` },
    ]);
  });
});

describe('openDisputes', () => {
  it('lists open disputes with order, event and buyer context, and hides resolved ones', async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    const b = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await openDispute(db, a.buyer.id, a.order.id, 'No me dejaron entrar', []);
    await openDispute(db, b.buyer.id, b.order.id, 'QR inválido', []);
    await db.update(disputes).set({ status: 'released' }).where(eq(disputes.orderId, b.order.id));

    const rows = await openDisputes(db, ADMIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: a.order.id,
      reason: 'No me dejaron entrar',
      priceCents: 5000,
      eventName: 'Concierto',
      buyerPhone: a.buyer.phone,
      orderState: 'disputada',
    });
    expect(rows[0].evidencePaths).toEqual([]);
  });
});

describe('queuedPayouts', () => {
  it('lists queued payouts with seller phone and the order state, hides paid ones', async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    const b = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await db.insert(payouts).values({ orderId: a.order.id, sellerId: a.seller.id, amountCents: 4500 });
    await db.insert(payouts).values({ orderId: b.order.id, sellerId: b.seller.id, amountCents: 4500, status: 'paid', bankRef: 'X' });
    await db.update(orders).set({ state: 'liberada' }).where(eq(orders.id, a.order.id));

    const rows = await queuedPayouts(db, ADMIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: a.order.id, amountCents: 4500, sellerPhone: a.seller.phone, orderState: 'liberada', eventName: 'Concierto' });
  });

  it('shows a queued payout whose order was refunded afterwards, so the operator sees it cannot be paid', async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await db.insert(payouts).values({ orderId: a.order.id, sellerId: a.seller.id, amountCents: 4500 });
    await db.update(orders).set({ state: 'reembolsada' }).where(eq(orders.id, a.order.id));
    expect((await queuedPayouts(db, ADMIN))[0].orderState).toBe('reembolsada');
  });
});

describe('allEvents', () => {
  it('lists events newest-first with status', async () => {
    const a = await seedPaidOrder(db, gw, { deliveryMode: 'file', startsAt: new Date(Date.now() + 5 * 864e5) });
    const rows = await allEvents(db, ADMIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: a.event.id, name: 'Concierto', status: 'active', faceValueCents: 5000 });
  });
});

describe('pendingListings', () => {
  it('lists pending listings with event, face value, seller and file paths; hides the rest', async () => {
    const p = await seedListing(db, { status: 'pending', askCents: 7000 });
    await seedListing(db, { status: 'verified' });
    await seedListing(db, { status: 'rejected' });
    await db.update(listings).set({ proofPath: `proof/${p.seller.id}/x`, filePath: `ticket/${p.seller.id}/y` }).where(eq(listings.id, p.listing.id));

    const rows = await pendingListings(db, ADMIN);
    expect(rows).toEqual([
      {
        listingId: p.listing.id,
        askCents: 7000,
        faceValueCents: 5000,
        deliveryMode: 'transfer',
        eventName: 'Concierto',
        sellerPhone: p.seller.phone,
        proofPath: `proof/${p.seller.id}/x`,
        filePath: `ticket/${p.seller.id}/y`,
      },
    ]);
  });
});

describe('every admin read requires an admin who passed 2FA (data-layer gate, not only the page layout)', () => {
  const READS = {
    pendingIdentities,
    openDisputes,
    queuedPayouts,
    allEvents,
    pendingListings,
  } as const;
  const DENIED: [string, Actor | null][] = [
    ['no actor', null],
    ['a normal user', { userId: ADMIN.userId, role: 'user', mfa: true }],
    ['an admin without 2FA', { userId: ADMIN.userId, role: 'admin', mfa: false }],
  ];
  for (const [name, fn] of Object.entries(READS)) {
    it.each(DENIED)(`${name} refuses %s`, async (_who, actor) => {
      await expect((fn as (d: Db, a: Actor | null) => Promise<unknown>)(db, actor)).rejects.toBeInstanceOf(ForbiddenError);
    });
  }
});
