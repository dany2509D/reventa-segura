import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { payouts } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { HOUR, getOrder, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { FakeGateway } from '@/lib/payments/fake-gateway';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
// The blob store is only needed by the identity purge; a misconfigured store must not block money flows.
vi.mock('@/lib/uploads/store', () => ({
  getStore: () => {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  },
}));

const { GET } = await import('./route');

const SECRET = 'cron-secret-0123456789abcdef0123456789';
const call = () =>
  GET(new Request('http://localhost/api/cron/maintenance', { headers: { authorization: `Bearer ${SECRET}` } }));

beforeEach(async () => {
  h.db = await makeTestDb();
  vi.stubEnv('FAKE_GATEWAY_SECRET', 'cron-gw-secret');
  vi.stubEnv('CRON_SECRET', SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/cron/maintenance — payouts and storage independence', () => {
  it('queues the seller payout when the cron releases an order after the confirmation window', async () => {
    const startsAt = new Date(Date.now() - 13 * HOUR);
    const { order, seller } = await seedPaidOrder(h.db, new FakeGateway('cron-gw-secret'), {
      deliveryMode: 'file',
      startsAt,
      paidAt: new Date(startsAt.getTime() - 24 * HOUR),
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect((await res.json()).released).toBe(1);
    expect((await getOrder(h.db, order.id)).state).toBe('liberada');
    const rows = await h.db.select().from(payouts).where(eq(payouts.orderId, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sellerId: seller.id, amountCents: 4500, status: 'queued' });
  });

  it('a broken blob store does not stop releases or refunds (only the identity purge is affected)', async () => {
    const gw = new FakeGateway('cron-gw-secret');
    const startsAt = new Date(Date.now() - 13 * HOUR);
    const released = await seedPaidOrder(h.db, gw, {
      deliveryMode: 'file',
      startsAt,
      paidAt: new Date(startsAt.getTime() - 24 * HOUR),
    });
    const now = Date.now();
    const expired = await seedPaidOrder(h.db, gw, {
      deliveryMode: 'transfer',
      startsAt: new Date(now + 24 * HOUR),
      paidAt: new Date(now - 3 * HOUR), // 2 h transfer deadline already passed
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect((await getOrder(h.db, released.order.id)).state).toBe('liberada');
    expect((await getOrder(h.db, expired.order.id)).state).toBe('reembolsada');
  });
});
