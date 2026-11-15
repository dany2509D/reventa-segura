import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './test-db';
import type { Db } from './types';
import * as s from './schema';
import { audit } from '../audit/audit';

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});

// Drizzle wraps driver errors; the trigger message lives in `cause`.
function isAppendOnlyError(e: unknown): boolean {
  return /append-only/.test(String((e as { cause?: unknown }).cause ?? e));
}

async function seedOrder() {
  const [seller] = await db.insert(s.users).values({ phone: `+507${Math.random().toString().slice(2, 10)}` }).returning();
  const [buyer] = await db.insert(s.users).values({ phone: `+507${Math.random().toString().slice(2, 10)}` }).returning();
  const [event] = await db
    .insert(s.events)
    .values({ name: 'Concierto', venue: 'Atlapa', lat: 9, lng: -79.5, radiusM: 500, startsAt: new Date(), faceValueCents: 5000 })
    .returning();
  const [listing] = await db
    .insert(s.listings)
    .values({ sellerId: seller.id, eventId: event.id, askCents: 5000, deliveryMode: 'transfer', fingerprint: 'fp-' + Math.random(), proofPath: 'p' })
    .returning();
  const [order] = await db
    .insert(s.orders)
    .values({ listingId: listing.id, buyerId: buyer.id, state: 'creada', priceCents: 5000, feeCents: 500 })
    .returning();
  return order;
}

describe('schema', () => {
  it('rejects duplicate phone', async () => {
    await db.insert(s.users).values({ phone: '+50760000001' });
    await expect(db.insert(s.users).values({ phone: '+50760000001' })).rejects.toThrow();
  });

  it('blocks UPDATE on ledger_entries', async () => {
    const order = await seedOrder();
    const [row] = await db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'charge', amountCents: 5500, ref: 'r1' }).returning();
    await expect(db.execute(sql`UPDATE ledger_entries SET amount_cents = 1 WHERE id = ${row.id}`)).rejects.toSatisfy(isAppendOnlyError);
  });

  it('blocks DELETE on ledger_entries', async () => {
    const order = await seedOrder();
    const [row] = await db.insert(s.ledgerEntries).values({ orderId: order.id, kind: 'charge', amountCents: 5500, ref: 'r2' }).returning();
    await expect(db.execute(sql`DELETE FROM ledger_entries WHERE id = ${row.id}`)).rejects.toSatisfy(isAppendOnlyError);
  });

  it('blocks UPDATE and DELETE on audit_log', async () => {
    const [row] = await db.insert(s.auditLog).values({ actorId: null, action: 'a', entity: 'e', entityId: '1' }).returning();
    await expect(db.execute(sql`UPDATE audit_log SET action = 'x' WHERE id = ${row.id}`)).rejects.toSatisfy(isAppendOnlyError);
    await expect(db.execute(sql`DELETE FROM audit_log WHERE id = ${row.id}`)).rejects.toSatisfy(isAppendOnlyError);
  });

  it('audit() inserts a row with null actorId', async () => {
    await db.transaction(async (tx) => {
      await audit(tx, { actorId: null, action: 'system.tick', entity: 'order', entityId: 'o1', detail: { a: 1 } });
    });
    const rows = await db.select().from(s.auditLog).where(sql`${s.auditLog.action} = 'system.tick'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull();
    expect(rows[0].detail).toEqual({ a: 1 });
  });

  it('allows only one active listing per fingerprint', async () => {
    const order = await seedOrder();
    const [l] = await db.select().from(s.listings).where(sql`${s.listings.id} = ${order.listingId}`);
    await expect(
      db.insert(s.listings).values({ sellerId: l.sellerId, eventId: l.eventId, askCents: 1, deliveryMode: 'transfer', fingerprint: l.fingerprint, proofPath: 'p' }),
    ).rejects.toThrow();
    await db.update(s.listings).set({ status: 'withdrawn' }).where(sql`${s.listings.id} = ${l.id}`);
    await expect(
      db.insert(s.listings).values({ sellerId: l.sellerId, eventId: l.eventId, askCents: 1, deliveryMode: 'transfer', fingerprint: l.fingerprint, proofPath: 'p' }),
    ).resolves.toBeDefined();
  });
});
