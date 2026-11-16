import { beforeEach, describe, expect, it } from 'vitest';
import { appConfig, disputes, events, listings, orders, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { MemoryBlobStore } from '@/lib/uploads/store';
import { SellerBlockedError } from './errors';
import { DEFAULT_MAX_LOST_DISPUTES, assertSellerNotBlocked, createListing } from './listings';

const NOW = new Date('2027-05-01T12:00:00Z');
const DAY = 24 * 3600_000;

let db: Db;
let seq = 0;
beforeEach(async () => {
  db = await makeTestDb();
});

async function user(identityStatus: 'approved' | 'none' = 'approved') {
  const [u] = await db.insert(users).values({ phone: `+5076${String(++seq).padStart(7, '0')}`, identityStatus }).returning();
  return u;
}

async function event(status: 'active' | 'cancelled' = 'active') {
  const [e] = await db
    .insert(events)
    .values({ name: 'E', venue: 'V', lat: 9, lng: -79.5, radiusM: 500, startsAt: new Date(NOW.getTime() + 7 * DAY), faceValueCents: 5000, status })
    .returning();
  return e;
}

/** A sold listing of `sellerId` whose buyer opened a dispute, resolved `status` at `resolvedAt`. */
async function lostDispute(
  sellerId: string,
  o: { status?: 'refunded' | 'released' | 'open'; resolvedAt?: Date; eventStatus?: 'active' | 'cancelled' } = {},
) {
  const ev = await event(o.eventStatus);
  const buyer = await user('none');
  const [l] = await db
    .insert(listings)
    .values({ sellerId, eventId: ev.id, askCents: 5000, deliveryMode: 'transfer', status: 'sold', fingerprint: `fp-${++seq}`, proofPath: 'p' })
    .returning();
  const [ord] = await db
    .insert(orders)
    .values({ listingId: l.id, buyerId: buyer.id, state: 'reembolsada', priceCents: 5000, feeCents: 500 })
    .returning();
  const status = o.status ?? 'refunded';
  await db.insert(disputes).values({
    orderId: ord.id,
    openedBy: buyer.id,
    reason: 'no entré',
    status,
    resolvedAt: status === 'open' ? null : (o.resolvedAt ?? new Date(NOW.getTime() - DAY)),
  });
}

describe('seller block after repeated lost disputes (SEG-08)', () => {
  it('defaults to 3 lost disputes', () => {
    expect(DEFAULT_MAX_LOST_DISPUTES).toBe(3);
  });

  it('blocks a seller with 3 disputes refunded in the last 90 days', async () => {
    const s = await user();
    for (let i = 0; i < 3; i++) await lostDispute(s.id);
    await expect(assertSellerNotBlocked(db, s.id, NOW)).rejects.toBeInstanceOf(SellerBlockedError);
  });

  it('createListing refuses a blocked seller before looking at any file', async () => {
    const s = await user();
    for (let i = 0; i < 3; i++) await lostDispute(s.id);
    const ev = await event();
    const input = { sellerId: s.id, eventId: ev.id, askCents: 5000, deliveryMode: 'transfer' as const, proof: Buffer.from('not an image'), now: NOW };
    await expect(createListing(db, new MemoryBlobStore(), input)).rejects.toBeInstanceOf(SellerBlockedError);
  });

  it('does not count fewer than the limit, released or open disputes, or disputes older than 90 days', async () => {
    const s = await user();
    await lostDispute(s.id);
    await lostDispute(s.id);
    await lostDispute(s.id, { status: 'released' });
    await lostDispute(s.id, { status: 'open' });
    await lostDispute(s.id, { resolvedAt: new Date(NOW.getTime() - 91 * DAY) });
    await expect(assertSellerNotBlocked(db, s.id, NOW)).resolves.toBeUndefined();
  });

  it('does not count refunds forced by an event cancellation (not the seller’s fault)', async () => {
    const s = await user();
    await lostDispute(s.id);
    await lostDispute(s.id);
    await lostDispute(s.id, { eventStatus: 'cancelled' });
    await expect(assertSellerNotBlocked(db, s.id, NOW)).resolves.toBeUndefined();
  });

  it('counts only this seller’s disputes', async () => {
    const a = await user();
    const b = await user();
    for (let i = 0; i < 3; i++) await lostDispute(a.id);
    await expect(assertSellerNotBlocked(db, b.id, NOW)).resolves.toBeUndefined();
  });

  it('is configurable with app_config.maxLostDisputes', async () => {
    const s = await user();
    await lostDispute(s.id);
    await expect(assertSellerNotBlocked(db, s.id, NOW)).resolves.toBeUndefined();
    await db.insert(appConfig).values({ key: 'maxLostDisputes', value: '1' });
    await expect(assertSellerNotBlocked(db, s.id, NOW)).rejects.toBeInstanceOf(SellerBlockedError);
  });
});
