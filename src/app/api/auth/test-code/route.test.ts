import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { users } from '@/lib/db/schema';
import { requestOtp, verifyOtp } from '@/lib/auth/otp';
import { CapturingSmsSender, clearCapturedLoginCodes, peekCapturedLoginCode } from '@/lib/auth/test-mode';
import { dbCloner } from '@/lib/tickets/test-helpers';

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
    vi.stubEnv('ALLOW_FAKE_SMS', 'true'); // /verify's legacy { phone, code } flow is gated behind it (non-production only)
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

  it('production with BOTH flags is still a 404 (unreachable in production)', async () => {
    testMode(true, 'production', '1');
    await requestOtp(db, PHONE, new CapturingSmsSender());
    await expectNotFound(await ask(PHONE));
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

/*
 * ADMIN login code, only on the owner's computer: TEST_MODE_ADMIN_KEY (>= 32 chars, in .env.local)
 * must arrive in the x-test-admin-key header, login-code test mode must be on and NODE_ENV must not
 * be production (ALLOW_TEST_LOGIN_CODES does not count here). Every refusal is the same empty 404.
 */
describe('POST /api/auth/test-code — admin phone with the local admin key', () => {
  // Generated per run: no secret is written in this file.
  const KEY = randomBytes(32).toString('hex');
  const withKey = (key: string) => ({ 'x-test-admin-key': key });

  function adminKeyEnv({ mode = true, nodeEnv = 'test', allow = '', key = KEY }: { mode?: boolean; nodeEnv?: string; allow?: string; key?: string } = {}) {
    testMode(mode, nodeEnv, allow);
    vi.stubEnv('TEST_MODE_ADMIN_KEY', key);
  }

  async function adminWithCode() {
    await db.insert(users).values({ phone: ADMIN, role: 'admin' });
    await requestOtp(db, ADMIN, new CapturingSmsSender());
    const code = peekCapturedLoginCode(ADMIN);
    expect(code).toMatch(/^\d{6}$/);
    return code!;
  }

  it('right key + admin phone + development → 200 { code }, not cached, the code the login verifies', async () => {
    adminKeyEnv({ nodeEnv: 'development' });
    const captured = await adminWithCode();
    const res = await ask('6999-0000', withKey(KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ code: captured });
  });

  it('right key + admin phone under NODE_ENV=test → 200 (any non-production NODE_ENV)', async () => {
    adminKeyEnv();
    const captured = await adminWithCode();
    expect(await (await ask(ADMIN, withKey(KEY))).json()).toEqual({ code: captured });
  });

  it('end to end: /request → /test-code with the key → /verify still demands the TOTP second factor', async () => {
    adminKeyEnv();
    vi.stubEnv('ALLOW_FAKE_SMS', 'true'); // /verify's legacy { phone, code } flow is gated behind it (non-production only)
    await db.insert(users).values({ phone: ADMIN, role: 'admin' });
    expect((await requestPost(post('http://localhost/api/auth/request', { phone: ADMIN }))).status).toBe(200);
    const { code } = await (await ask(ADMIN, withKey(KEY))).json();
    const v = await verifyPost(post('http://localhost/api/auth/verify', { phone: ADMIN, code }));
    expect(v.status).toBe(200);
    expect(await v.json()).toMatchObject({ role: 'admin', mfaRequired: true });
  });

  describe('every refusal is the same empty 404', () => {
    const denied: [string, () => Promise<Response>][] = [
      ['feature off (TEST_MODE_SHOW_LOGIN_CODE empty)', async () => {
        adminKeyEnv({ mode: false });
        await adminWithCode();
        return ask(ADMIN, withKey(KEY));
      }],
      ['key unset, no header', async () => {
        adminKeyEnv({ key: '' });
        await adminWithCode();
        return ask(ADMIN);
      }],
      ['key unset, empty header', async () => {
        adminKeyEnv({ key: '' });
        await adminWithCode();
        return ask(ADMIN, withKey(''));
      }],
      ['key too short (31 chars), header equal to it', async () => {
        const short = KEY.slice(0, 31);
        adminKeyEnv({ key: short });
        await adminWithCode();
        return ask(ADMIN, withKey(short));
      }],
      ['no header', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN);
      }],
      ['wrong key of the same length', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN, withKey(randomBytes(32).toString('hex')));
      }],
      ['the key with one character changed', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN, withKey(`${KEY.slice(0, -1)}${KEY.endsWith('0') ? '1' : '0'}`));
      }],
      ['the key in upper case', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN, withKey(KEY.toUpperCase()));
      }],
      ['the key plus a suffix', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN, withKey(`${KEY}x`));
      }],
      ['a prefix of the key', async () => {
        adminKeyEnv();
        await adminWithCode();
        return ask(ADMIN, withKey(KEY.slice(0, 32)));
      }],
      ['right key, but NODE_ENV=production with BOTH test-mode flags', async () => {
        adminKeyEnv({ nodeEnv: 'production', allow: '1' });
        await adminWithCode();
        return ask(ADMIN, withKey(KEY));
      }],
      ['right key, but NODE_ENV=production with only TEST_MODE_SHOW_LOGIN_CODE', async () => {
        adminKeyEnv({ nodeEnv: 'production' });
        await adminWithCode();
        return ask(ADMIN, withKey(KEY));
      }],
      ['right key, but test mode off', async () => {
        adminKeyEnv({ mode: false });
        await adminWithCode();
        return ask(ADMIN, withKey(KEY));
      }],
      ['right key + admin phone, but no captured code', async () => {
        adminKeyEnv();
        await db.insert(users).values({ phone: ADMIN, role: 'admin' });
        return ask(ADMIN, withKey(KEY));
      }],
      ['right key + admin phone, but the code expired', async () => {
        adminKeyEnv();
        await db.insert(users).values({ phone: ADMIN, role: 'admin' });
        await requestOtp(db, ADMIN, new CapturingSmsSender(() => Date.now() - 11 * 60 * 1000));
        return ask(ADMIN, withKey(KEY));
      }],
      ['right key, unknown phone (no code requested)', async () => {
        adminKeyEnv();
        return ask('+50769999999', withKey(KEY));
      }],
      ['no key at all, normal phone with no code (today’s plain 404)', async () => {
        adminKeyEnv();
        return ask('+50769999999');
      }],
    ];

    it.each(denied)('%s → empty 404', async (_case, run) => {
      await expectNotFound(await run());
    });

    it('status, headers and body are byte-for-byte the same in every case (no oracle)', async () => {
      const freshDb = dbCloner(); // one migrated template, cloned per case (fast)
      const seen = new Set<string>();
      for (const [, run] of denied) {
        db = await freshDb();
        clearCapturedLoginCodes();
        vi.unstubAllEnvs();
        const res = await run();
        const headers = [...res.headers.entries()].sort();
        seen.add(JSON.stringify({ status: res.status, headers, body: await res.text() }));
      }
      expect([...seen]).toEqual([JSON.stringify({ status: 404, headers: [['cache-control', 'no-store']], body: '' })]);
    });
  });

  describe('non-admin phones are unaffected by the key', () => {
    it.each([
      ['the right key', KEY],
      ['a wrong key', 'x'.repeat(64)],
      ['an empty key header', ''],
    ])('with %s → the normal non-admin answer (200 { code })', async (_case, header) => {
      adminKeyEnv();
      await requestOtp(db, PHONE, new CapturingSmsSender());
      const res = await ask(PHONE, withKey(header));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ code: peekCapturedLoginCode(PHONE) });
    });

    it('in production with BOTH flags neither a non-admin nor the admin (even with the key) gets a code', async () => {
      adminKeyEnv({ nodeEnv: 'production', allow: '1' });
      await requestOtp(db, PHONE, new CapturingSmsSender());
      await adminWithCode();
      await expectNotFound(await ask(PHONE, withKey(KEY)));
      await expectNotFound(await ask(ADMIN, withKey(KEY)));
    });
  });

  it('feature off with the right key: answered before the database is touched (as today)', async () => {
    adminKeyEnv({ mode: false });
    db = new Proxy({} as Db, { get: () => { throw new Error('database must not be used'); } });
    await expectNotFound(await ask(ADMIN, withKey(KEY)));
  });

  it('the CSRF/JSON guard still runs first: right key + foreign Origin → 403, form body → 415', async () => {
    adminKeyEnv();
    await adminWithCode();
    expect((await ask(ADMIN, { ...withKey(KEY), origin: 'https://evil.example' })).status).toBe(403);
    const form = post(URL_TC, 'phone=69990000', { 'content-type': 'application/x-www-form-urlencoded', ...withKey(KEY) });
    expect((await testCodePost(form)).status).toBe(415);
  });

  it('rate limit: wrong-key guesses count like any other call; the right key does not bypass the 429', async () => {
    adminKeyEnv();
    await adminWithCode();
    for (let i = 0; i < 10; i++) {
      await expectNotFound(await ask(ADMIN, withKey(randomBytes(32).toString('hex'))));
    }
    const limited = await ask(ADMIN, withKey(KEY));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await ask(ADMIN, { ...withKey(KEY), 'x-forwarded-for': '198.51.100.9' })).status).toBe(200); // other client
  });

  it('logs neither the key, the code nor the phone', async () => {
    const calls: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void calls.push(args));
    }
    adminKeyEnv({ nodeEnv: 'development' });
    await db.insert(users).values({ phone: ADMIN, role: 'admin' });
    await requestPost(post('http://localhost/api/auth/request', { phone: ADMIN }));
    const { code } = await (await ask(ADMIN, withKey(KEY))).json();
    await ask(ADMIN, withKey('wrong'));
    await ask(ADMIN);
    const logged = JSON.stringify(calls);
    expect(code).toMatch(/^\d{6}$/);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('6999');
  });
});
