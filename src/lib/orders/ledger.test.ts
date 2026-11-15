import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { ledgerEntries, orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { appendEntry, sellerPendingCents } from './ledger';
import { handlePaymentWebhook, startCheckout } from './service';
import type { OrderState } from './state-machine';
import { newUser, seedListing } from './test-fixtures';

let db: Db;
let gw: FakeGateway;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('ledger-secret');
});

async function insertOrder(state: OrderState, sellerOverride?: Awaited<ReturnType<typeof seedListing>>) {
  const s = sellerOverride ?? (await seedListing(db));
  const [o] = await db
    .insert(orders)
    .values({ listingId: s.listing.id, buyerId: s.buyer.id, state, priceCents: 5000, feeCents: 500 })
    .returning();
  return { ...s, order: o };
}

describe('appendEntry', () => {
  it('inserts an entry that can never be updated afterwards', async () => {
    const { order } = await insertOrder('creada');
    await db.transaction((tx) => appendEntry(tx, { orderId: order.id, kind: 'charge', amountCents: 5000, ref: 'r1' }));
    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, order.id));
    expect(rows).toMatchObject([{ kind: 'charge', amountCents: 5000, ref: 'r1' }]);
    await expect(
      db.execute(sql`UPDATE ledger_entries SET amount_cents = 1 WHERE id = ${rows[0].id}`),
    ).rejects.toSatisfy((e: unknown) => /append-only/.test(String((e as { cause?: unknown }).cause ?? e)));
  });

  it.each([1.5, Number.NaN, Infinity])('rejects non-integer amount %s', async (amountCents) => {
    const { order } = await insertOrder('creada');
    await expect(
      db.transaction((tx) => appendEntry(tx, { orderId: order.id, kind: 'fee', amountCents, ref: 'r' })),
    ).rejects.toThrow(RangeError);
  });

  it('rejects an empty ref', async () => {
    const { order } = await insertOrder('creada');
    await expect(
      db.transaction((tx) => appendEntry(tx, { orderId: order.id, kind: 'fee', amountCents: -1, ref: '' })),
    ).rejects.toThrow(RangeError);
  });
});

describe('payment ledger', () => {
  it('a 5000 payment at 10% leaves charge +5000, fee -500, seller_due +4500 and 4500 pending', async () => {
    const { seller, buyer, listing } = await seedListing(db, { askCents: 5000 });
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id);
    const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    await handlePaymentWebhook(db, gw, rawBody, headers);

    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId));
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(rows).toHaveLength(3);
    expect(byKind.charge).toMatchObject({ amountCents: 5000, ref: `fake_${orderId}` });
    expect(byKind.fee).toMatchObject({ amountCents: -500, ref: `fake_${orderId}` });
    expect(byKind.seller_due).toMatchObject({ amountCents: 4500, ref: `fake_${orderId}` });
    expect(await sellerPendingCents(db, seller.id)).toBe(4500);
  });
});

describe('sellerPendingCents', () => {
  it('is 0 for a seller without sales', async () => {
    expect(await sellerPendingCents(db, (await newUser(db)).id)).toBe(0);
  });

  it('sums seller_due only for paid, not-yet-settled orders of that seller', async () => {
    const pendingStates: OrderState[] = [
      'transferencia_pendiente',
      'entrada_recibida',
      'ingreso_confirmado',
      'disputada',
      'liberada',
    ];
    const excludedStates: OrderState[] = ['creada', 'liquidada', 'reembolsada', 'cancelada'];
    const first = await seedListing(db);
    const sellerId = first.seller.id;
    let expected = 0;
    let i = 0;
    for (const state of [...pendingStates, ...excludedStates]) {
      // Every order belongs to the same seller, each on its own listing.
      const s = i === 0 ? first : await seedListing(db);
      if (i > 0) await db.execute(sql`UPDATE listings SET seller_id = ${sellerId} WHERE id = ${s.listing.id}`);
      const { order } = await insertOrder(state, s);
      const due = 1000 + i;
      await db.transaction((tx) => appendEntry(tx, { orderId: order.id, kind: 'seller_due', amountCents: due, ref: `r${i}` }));
      // Other kinds never count.
      await db.transaction((tx) => appendEntry(tx, { orderId: order.id, kind: 'charge', amountCents: 9999, ref: `r${i}` }));
      if (pendingStates.includes(state)) expected += due;
      i++;
    }
    // Another seller's pending sale is not counted.
    const other = await insertOrder('liberada');
    await db.transaction((tx) => appendEntry(tx, { orderId: other.order.id, kind: 'seller_due', amountCents: 777, ref: 'x' }));

    expect(await sellerPendingCents(db, sellerId)).toBe(expected);
    expect(await sellerPendingCents(db, other.seller.id)).toBe(777);
  });
});
