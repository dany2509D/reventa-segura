import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@/lib/auth/session';
import { appConfig, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { LIMITS, TOO_MANY_REQUESTS, type LimitRule } from '@/lib/security/limits';
import { dbCloner } from '@/lib/tickets/test-helpers';

// Many sequential requests per test on a loaded machine.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const freshDb = dbCloner();
const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

const { POST: otpRequest } = await import('./auth/request/route');
const { POST: otpVerify } = await import('./auth/verify/route');
const { POST: checkout } = await import('./checkout/route');
const { POST: identity } = await import('./identity/route');
const { POST: createListing } = await import('./listings/route');
const { DELETE: withdrawListing } = await import('./listings/[id]/route');
const { POST: received } = await import('./orders/[id]/received/route');
const { POST: entry } = await import('./orders/[id]/entry/route');
const { POST: dispute } = await import('./orders/[id]/dispute/route');

const BASE = 'http://localhost';
const SAME_ORIGIN = { host: 'localhost', origin: BASE };

let seq = 0;
async function userCookie(): Promise<string> {
  const [u] = await h.db
    .insert(users)
    .values({ phone: `+5076${String(++seq).padStart(7, '0')}`, identityStatus: 'approved' })
    .returning();
  return `session=${await createSession(h.db, u.id, 'user')}`;
}

const json = (path: string, body: unknown, headers: Record<string, string>) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...SAME_ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

// An empty multipart body: every upload route rejects it cheaply after the limiter.
const multipart = (path: string, cookie: string) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers: { ...SAME_ORIGIN, cookie }, body: new FormData() });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

type Case = { route: string; rule: LimitRule; call: (subject: string) => Promise<Response>; subject: () => Promise<string> };

const ip = (() => {
  let n = 0;
  return async () => `203.0.113.${++n}`;
})();

const CASES: Case[] = [
  {
    route: 'POST /api/auth/request (per IP)',
    rule: LIMITS.otpRequestIp,
    subject: ip,
    call: (addr) => otpRequest(json('/api/auth/request', { phone: '123' }, { 'x-forwarded-for': addr })),
  },
  {
    route: 'POST /api/auth/verify (per IP)',
    rule: LIMITS.otpVerifyIp,
    subject: ip,
    call: (addr) => otpVerify(json('/api/auth/verify', { phone: '+50769999999', code: '000000' }, { 'x-forwarded-for': addr })),
  },
  {
    route: 'POST /api/checkout',
    rule: LIMITS.checkout,
    subject: userCookie,
    call: (cookie) => checkout(json('/api/checkout', { listingId: randomUUID() }, { cookie }) as never),
  },
  { route: 'POST /api/identity', rule: LIMITS.identity, subject: userCookie, call: (c) => identity(multipart('/api/identity', c)) },
  { route: 'POST /api/listings', rule: LIMITS.listingCreate, subject: userCookie, call: (c) => createListing(multipart('/api/listings', c)) },
  {
    route: 'DELETE /api/listings/[id]',
    rule: LIMITS.listingWithdraw,
    subject: userCookie,
    call: (cookie) =>
      withdrawListing(new Request(`${BASE}/api/listings/x`, { method: 'DELETE', headers: { ...SAME_ORIGIN, cookie } }), params(randomUUID())),
  },
  {
    route: 'POST /api/orders/[id]/received',
    rule: LIMITS.orderReceived,
    subject: userCookie,
    call: (c) => received(multipart('/api/orders/x/received', c), params(randomUUID())),
  },
  {
    route: 'POST /api/orders/[id]/entry',
    rule: LIMITS.orderEntry,
    subject: userCookie,
    call: (c) => entry(multipart('/api/orders/x/entry', c), params(randomUUID())),
  },
  {
    route: 'POST /api/orders/[id]/dispute',
    rule: LIMITS.orderDispute,
    subject: userCookie,
    call: (c) => dispute(multipart('/api/orders/x/dispute', c), params(randomUUID())),
  },
];

beforeAll(async () => {
  await freshDb(); // migrate the template once
});
beforeEach(async () => {
  h.db = await freshDb();
  process.env.FAKE_GATEWAY_SECRET = 'rate-limit-secret';
});
afterEach(() => vi.restoreAllMocks());

describe.each(CASES)('$route', ({ rule, call, subject }) => {
  it(`allows ${rule.limit} requests, then answers 429 with Retry-After; other subjects are unaffected`, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await subject();
    for (let i = 0; i < rule.limit; i++) {
      const res = await call(a);
      expect(res.status, `request ${i + 1}`).not.toBe(429);
    }
    const limited = await call(a);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({ error: TOO_MANY_REQUESTS });

    const b = await subject();
    expect((await call(b)).status).not.toBe(429);
  });
});

describe('POST /api/auth/request: platform SMS cap', () => {
  it('answers 503 and raises an alert once smsDailyCap codes went out in 24 h', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await h.db.insert(appConfig).values({ key: 'smsDailyCap', value: '1' });
    const send = (phone: string, addr: string) => otpRequest(json('/api/auth/request', { phone }, { 'x-forwarded-for': addr }));
    expect((await send('+50761111111', '198.51.100.1')).status).toBe(200);
    const res = await send('+50762222222', '198.51.100.2');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/^Servicio no disponible/);
    const lines = errors.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(lines).toContainEqual(expect.objectContaining({ alert: true, msg: 'sms_daily_cap_reached' }));
    expect(JSON.stringify(lines)).not.toContain('62222222');
  });
});
