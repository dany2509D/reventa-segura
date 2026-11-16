import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { users } from '@/lib/db/schema';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { CapturingSmsSender, clearCapturedLoginCodes, peekCapturedLoginCode } from '@/lib/auth/test-mode';

let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));

import { POST as testCodePost } from './route';
import { POST as requestPost } from '@/app/api/auth/request/route';
import { POST as verifyPost } from '@/app/api/auth/verify/route';

const PHONE = '+50761234567';
const ADMIN = '+50769990000';
const URL_TC = 'http://localhost/api/auth/test-code';

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ask = (phone: unknown, headers?: Record<string, string>) => testCodePost(post(URL_TC, { phone }, headers));

function testMode(on: boolean, nodeEnv = 'test', allow = '') {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', on ? '1' : '');
  vi.stubEnv('ALLOW_TEST_LOGIN_CODES', allow);
}

async function expectNotFound(res: Response) {
  expect(res.status).toBe(404);
  expect(await res.text()).toBe('');
}

beforeEach(async () => {
  db = await makeTestDb();
  clearCapturedLoginCodes();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/auth/test-code — test mode OFF', () => {
  it('is an empty 404 for every request, without touching the database', async () => {
    testMode(false);
    await requestOtp(db, PHONE, new CapturingSmsSender()); // a code exists, but the mode is off
    db = new Proxy({} as Db, { get: () => { throw new Error('database must not be used'); } });
    await expectNotFound(await ask(PHONE));
    await expectNotFound(await testCodePost(post(URL_TC, { phone: PHONE }, { origin: 'https://evil.example' })));
    await expectNotFound(await testCodePost(post(URL_TC, 'phone=1', { 'content-type': 'text/plain' })));
    await expectNotFound(await ask('nope'));
  });

  it('production with only TEST_MODE_SHOW_LOGIN_CODE=1 stays off (needs ALLOW_TEST_LOGIN_CODES=1 too)', async () => {
    testMode(true, 'production');
    await requestOtp(db, PHONE, new CapturingSmsSender());
    await expectNotFound(await ask(PHONE));
  });
});

describe('POST /api/auth/test-code — test mode ON', () => {
  beforeEach(() => testMode(true));

  it('returns the captured code for a normal user, not cached, without consuming it', async () => {
    await requestOtp(db, PHONE, new CapturingSmsSender());
    const res = await ask('6123-4567');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { code } = await res.json();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toBe(peekCapturedLoginCode(PHONE));
    expect((await (await ask(PHONE)).json()).code).toBe(code); // still readable
  });

  it('the code it shows is exactly the one the login verifies (requestOtp → route → verifyOtp)', async () => {
    await requestOtp(db, PHONE, new CapturingSmsSender());
    const { code } = await (await ask(PHONE)).json();
    const session = await verifyOtp(db, PHONE, code);
    expect(session?.sessionToken).toBeTruthy();
  });

  it('end to end through the real routes: /request → /test-code → /verify logs in', async () => {
    const r = await requestPost(post('http://localhost/api/auth/request', { phone: PHONE }));
    expect(r.status).toBe(200);
    const { code } = await (await ask(PHONE)).json();
    const v = await verifyPost(post('http://localhost/api/auth/verify', { phone: PHONE, code }));
    expect(v.status).toBe(200);
    expect(v.headers.get('set-cookie')).toMatch(/session=/);
  });

  it('never reveals the code of an admin (admins keep real SMS + TOTP)', async () => {
    await db.insert(users).values({ phone: ADMIN, role: 'admin' });
    await requestOtp(db, ADMIN, new CapturingSmsSender());
    expect(peekCapturedLoginCode(ADMIN)).toMatch(/^\d{6}$/); // captured, yet refused:
    await expectNotFound(await ask(ADMIN));
  });

  it.each([
    ['unknown phone (no code requested)', '+50769999999'],
    ['invalid phone', '12345'],
    ['foreign phone', '+14155550100'],
    ['not a string', 61234567],
  ])('%s → 404', async (_case, phone) => {
    await requestOtp(db, PHONE, new CapturingSmsSender());
    await expectNotFound(await ask(phone));
  });

  it('malformed body → 404', async () => {
    await expectNotFound(await testCodePost(post(URL_TC, '{not json')));
  });

  it('expired code → 404', async () => {
    await requestOtp(db, PHONE, new CapturingSmsSender(() => Date.now() - 11 * 60 * 1000));
    await expectNotFound(await ask(PHONE));
  });

  it('a foreign Origin → 403; same origin is fine', async () => {
    await requestOtp(db, PHONE, new CapturingSmsSender());
    expect((await ask(PHONE, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await ask(PHONE, { origin: 'http://localhost' })).status).toBe(200);
  });

  it('only JSON bodies (a cross-site form cannot post here without a CORS preflight) → 415', async () => {
    expect((await testCodePost(post(URL_TC, 'phone=61234567', { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415);
  });

  it('rate limit: 10 per minute per client IP, then 429 with Retry-After', async () => {
    for (let i = 0; i < 10; i++) expect((await ask('+50769999999')).status).toBe(404);
    const limited = await ask('+50769999999');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await ask('+50769999999', { 'x-forwarded-for': '198.51.100.9' })).status).toBe(404); // other client
  });

  it('production with BOTH flags works (pre-launch only — never on a public deployment)', async () => {
    testMode(true, 'production', '1');
    await requestOtp(db, PHONE, new CapturingSmsSender());
    expect((await ask(PHONE)).status).toBe(200);
  });

  it('logs neither phones nor codes', async () => {
    const calls: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void calls.push(args));
    }
    await requestPost(post('http://localhost/api/auth/request', { phone: PHONE }));
    const { code } = await (await ask(PHONE)).json();
    await ask(ADMIN);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain('6123');
  });
});
