import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { createSession } from '@/lib/auth/session';
import { seedListing } from '@/lib/orders/test-fixtures';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

const { POST } = await import('./route');

let fx: Awaited<ReturnType<typeof seedListing>>;

beforeEach(async () => {
  process.env.FAKE_GATEWAY_SECRET = 'route-secret';
  h.db = await makeTestDb();
  fx = await seedListing(h.db);
});

function post(body: unknown, token?: string) {
  return POST(
    new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(token ? { cookie: `session=${token}` } : {}) },
    }),
  );
}

describe('POST /api/checkout', () => {
  it('401 without a session', async () => {
    expect((await post({ listingId: fx.listing.id })).status).toBe(401);
    expect(await h.db.select().from(orders)).toHaveLength(0);
  });

  it('400 on an invalid body', async () => {
    const token = await createSession(h.db, fx.buyer.id, 'user');
    expect((await post({ listingId: 'not-a-uuid' }, token)).status).toBe(400);
  });

  it('200 with orderId and checkoutUrl for the session buyer', async () => {
    const token = await createSession(h.db, fx.buyer.id, 'user');
    const res = await post({ listingId: fx.listing.id }, token);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { orderId: string; checkoutUrl: string };
    expect(json.checkoutUrl).toContain(`fake_${json.orderId}`);
    const [order] = await h.db.select().from(orders).where(eq(orders.id, json.orderId));
    expect(order.buyerId).toBe(fx.buyer.id);
  });

  it('409 when the listing is held by another checkout', async () => {
    const first = await createSession(h.db, fx.buyer.id, 'user');
    expect((await post({ listingId: fx.listing.id }, first)).status).toBe(200);
    const { buyer: other } = await seedListing(h.db);
    const second = await createSession(h.db, other.id, 'user');
    expect((await post({ listingId: fx.listing.id }, second)).status).toBe(409);
  });

  it('422 when the seller tries to buy their own listing', async () => {
    const token = await createSession(h.db, fx.seller.id, 'user');
    expect((await post({ listingId: fx.listing.id }, token)).status).toBe(422);
  });
});
