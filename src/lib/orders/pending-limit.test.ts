import { beforeEach, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import {
  CHECKOUT_TTL_MS,
  MAX_PENDING_ORDERS_PER_BUYER,
  PendingOrdersLimitError,
  SelfPurchaseError,
  startCheckout,
} from './service';
import { seedListing } from './test-fixtures';

let db: Db;
let gw: FakeGateway;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('pending-limit-secret');
});

async function newBuyer(): Promise<string> {
  const [u] = await db.insert(users).values({ phone: `+5076${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` }).returning();
  return u.id;
}

describe('anti-hoarding: pending orders per buyer', () => {
  it('rejects a new reservation once the buyer holds the maximum of unpaid orders', async () => {
    const buyer = await newBuyer();
    for (let i = 0; i < MAX_PENDING_ORDERS_PER_BUYER; i++) {
      const { listing } = await seedListing(db, { status: 'verified' });
      await startCheckout(db, gw, buyer, listing.id);
    }
    const { listing } = await seedListing(db, { status: 'verified' });
    await expect(startCheckout(db, gw, buyer, listing.id)).rejects.toBeInstanceOf(PendingOrdersLimitError);
  });

  it('does not count abandoned (expired) checkouts, nor other buyers', async () => {
    const buyer = await newBuyer();
    const t0 = new Date();
    for (let i = 0; i < MAX_PENDING_ORDERS_PER_BUYER; i++) {
      const { listing } = await seedListing(db, { status: 'verified' });
      await startCheckout(db, gw, buyer, listing.id, t0);
    }
    const later = new Date(t0.getTime() + CHECKOUT_TTL_MS + 1000);
    const { listing } = await seedListing(db, { status: 'verified' });
    await expect(startCheckout(db, gw, buyer, listing.id, later)).resolves.toMatchObject({ orderId: expect.any(String) });

    const other = await newBuyer();
    const { listing: l2 } = await seedListing(db, { status: 'verified' });
    await expect(startCheckout(db, gw, other, l2.id)).resolves.toBeDefined();
  });

  it('a seller cannot buy their own listing', async () => {
    const { listing, seller } = await seedListing(db, { status: 'verified' });
    await expect(startCheckout(db, gw, seller.id, listing.id)).rejects.toBeInstanceOf(SelfPurchaseError);
  });
});
