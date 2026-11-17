import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { HOUR, getOrder, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { rateLimitHits } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

const { GET } = await import('./route');

const SECRET = 'cron-secret-0123456789abcdef0123456789';
const URL_C = 'http://localhost/api/cron/maintenance';
const call = (headers: Record<string, string> = {}) => GET(new Request(URL_C, { headers }));

beforeEach(async () => {
  h.db = await makeTestDb();
  vi.stubEnv('FAKE_GATEWAY_SECRET', 'cron-gw-secret');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  vi.stubEnv('CRON_SECRET', SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/cron/maintenance', () => {
  it('401 without the bearer secret or with a wrong one, and runs nothing', async () => {
    const now = new Date();
    const { order } = await seedPaidOrder(h.db, new FakeGateway('cron-gw-secret'), {
      deliveryMode: 'transfer',
      startsAt: new Date(now.getTime() + 24 * HOUR),
      paidAt: new Date(now.getTime() - 3 * HOUR),
    });
    for (const headers of [
      {} as Record<string, string>,
      { authorization: 'Bearer wrong' },
      { authorization: `Bearer ${SECRET}x` },
      { authorization: SECRET },
      { authorization: `Basic ${SECRET}` },
    ]) {
      const res = await call(headers);
      expect(res.status).toBe(401);
    }
    expect((await getOrder(h.db, order.id)).state).toBe('transferencia_pendiente');
  });

  it('200 with the counts when the secret matches, and the job actually runs', async () => {
    const now = new Date();
    const { order } = await seedPaidOrder(h.db, new FakeGateway('cron-gw-secret'), {
      deliveryMode: 'transfer',
      startsAt: new Date(now.getTime() + 24 * HOUR),
      paidAt: new Date(now.getTime() - 3 * HOUR), // transfer deadline passed an hour ago
    });
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      expiredTransfers: 1,
      released: 0,
      abandoned: 0,
      purgedIdentities: 0,
      failed: 0,
    });
    expect((await getOrder(h.db, order.id)).state).toBe('reembolsada');
  });

  it('also prunes rate-limit rows older than two days (the table grows with every API call)', async () => {
    const old = new Date(Date.now() - 3 * 24 * HOUR);
    await rateLimit(h.db, 'checkout:someone', 20, 3600, old);
    await rateLimit(h.db, 'checkout:someone', 20, 3600);
    expect((await call({ authorization: `Bearer ${SECRET}` })).status).toBe(200);
    expect(await h.db.select().from(rateLimitHits)).toHaveLength(1);
  });

  it('401 when CRON_SECRET is not set outside production', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call({ authorization: 'Bearer ' })).status).toBe(401);
    expect((await call({ authorization: 'Bearer undefined' })).status).toBe(401);
  });

  it('500 when CRON_SECRET is not set in production', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    expect((await call({ authorization: 'Bearer ' })).status).toBe(500);
  });

  it('still runs in production, where there is no payment gateway (manual Yappy / ACH only)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_FAKE_GATEWAY', '');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'blob-token');
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ failed: 0 });
  });
});
