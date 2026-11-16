import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import * as s from './schema';
import { makeTestDb } from './test-db';
import type { Db } from './types';

/*
 * Database backstops (migrations 0004_hardening, 0005_no_truncate): the code already enforces these
 * rules; the database refuses to store a violation even if a future bug or a manual query tries.
 */

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});

// Drizzle wraps driver errors; the constraint name / trigger message lives in `cause`.
const violates = (name: string | RegExp) => (e: unknown) => {
  const cause = (e as { cause?: { message?: string; constraint?: string } }).cause;
  const text = `${cause?.constraint ?? ''} ${cause?.message ?? ''} ${String(e)}`;
  return typeof name === 'string' ? text.includes(name) : name.test(text);
};

let seq = 0;
const phone = () => `+5076${String(++seq).padStart(7, '0')}`;
const EVENT = { name: 'E', venue: 'V', lat: 9, lng: -79.5, radiusM: 500, startsAt: new Date(), faceValueCents: 5000 };

async function seedOrder() {
  const [seller] = await db.insert(s.users).values({ phone: phone() }).returning();
  const [buyer] = await db.insert(s.users).values({ phone: phone() }).returning();
  const [event] = await db.insert(s.events).values(EVENT).returning();
  const [listing] = await db
    .insert(s.listings)
    .values({ sellerId: seller.id, eventId: event.id, askCents: 5000, deliveryMode: 'transfer', fingerprint: `fp-${seq}`, proofPath: 'p' })
    .returning();
  const [order] = await db
    .insert(s.orders)
    .values({ listingId: listing.id, buyerId: buyer.id, state: 'creada', priceCents: 5000, feeCents: 500 })
    .returning();
  return { seller, buyer, event, listing, order };
}

describe('CHECK constraints', () => {
  it('events: face value > 0 and radius between 50 and 5000 m', async () => {
    await expect(db.insert(s.events).values({ ...EVENT, faceValueCents: 0 })).rejects.toSatisfy(violates('events_face_value_positive'));
    await expect(db.insert(s.events).values({ ...EVENT, radiusM: 49 })).rejects.toSatisfy(violates('events_radius_range'));
    await expect(db.insert(s.events).values({ ...EVENT, radiusM: 5001 })).rejects.toSatisfy(violates('events_radius_range'));
    await expect(db.insert(s.events).values({ ...EVENT, radiusM: 50 })).resolves.toBeDefined();
    await expect(db.insert(s.events).values({ ...EVENT, radiusM: 5000 })).resolves.toBeDefined();
  });

  it('listings: ask > 0', async () => {
    const { seller, event } = await seedOrder();
    const row = { sellerId: seller.id, eventId: event.id, deliveryMode: 'transfer' as const, fingerprint: 'fp-ask', proofPath: 'p' };
    await expect(db.insert(s.listings).values({ ...row, askCents: 0 })).rejects.toSatisfy(violates('listings_ask_positive'));
    await expect(db.insert(s.listings).values({ ...row, askCents: -100 })).rejects.toSatisfy(violates('listings_ask_positive'));
  });

  it('orders: price > 0 and fee >= 0', async () => {
    const { buyer, listing } = await seedOrder();
    const row = { listingId: listing.id, buyerId: buyer.id, state: 'cancelada' as const };
    await expect(db.insert(s.orders).values({ ...row, priceCents: 0, feeCents: 0 })).rejects.toSatisfy(violates('orders_price_positive'));
    await expect(db.insert(s.orders).values({ ...row, priceCents: 100, feeCents: -1 })).rejects.toSatisfy(violates('orders_fee_non_negative'));
    await expect(db.insert(s.orders).values({ ...row, priceCents: 100, feeCents: 0 })).resolves.toBeDefined();
  });

  it('payouts: amount > 0', async () => {
    const { seller, order } = await seedOrder();
    await expect(db.insert(s.payouts).values({ orderId: order.id, sellerId: seller.id, amountCents: 0 })).rejects.toSatisfy(
      violates('payouts_amount_positive'),
    );
  });
});

describe('one charge, one refund and one open dispute per order', () => {
  it('a second charge for the same order is refused', async () => {
    const { order } = await seedOrder();
    await db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'charge', amountCents: 5000, ref: 'c1' });
    await expect(db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'charge', amountCents: 5000, ref: 'c2' })).rejects.toSatisfy(
      violates('ledger_one_charge_per_order_uq'),
    );
  });

  it('a second refund for the same order is refused; other kinds may repeat', async () => {
    const { order } = await seedOrder();
    await db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'refund', amountCents: -5000, ref: 'r1' });
    await expect(db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'refund', amountCents: -5000, ref: 'r2' })).rejects.toSatisfy(
      violates('ledger_one_refund_per_order_uq'),
    );
    await db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'fee', amountCents: -500, ref: 'f1' });
    await expect(db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'fee', amountCents: 500, ref: 'f2' })).resolves.toBeDefined();
  });

  it('a second OPEN dispute for the same order is refused; a new one after resolution is allowed', async () => {
    const { order, buyer } = await seedOrder();
    const d = { orderId: order.id, openedBy: buyer.id, reason: 'x' };
    const [first] = await db.insert(s.disputes).values(d).returning();
    await expect(db.insert(s.disputes).values(d)).rejects.toSatisfy(violates('disputes_one_open_per_order_uq'));
    await db.execute(sql`update disputes set status = 'released', resolved_at = now() where id = ${first.id}`);
    await expect(db.insert(s.disputes).values(d)).resolves.toBeDefined();
  });
});

describe('append-only tables refuse TRUNCATE', () => {
  it.each(['ledger_entries', 'audit_log'])('%s', async (table) => {
    await expect(db.execute(sql.raw(`TRUNCATE ${table}`))).rejects.toSatisfy(violates(/append-only: TRUNCATE not allowed/));
  });
});

describe('users.totp_last_step', () => {
  it('exists and stores a bigint step', async () => {
    const [u] = await db.insert(s.users).values({ phone: phone(), totpLastStep: 60_000_000_000 }).returning();
    expect(u.totpLastStep).toBe(60_000_000_000);
  });
});
