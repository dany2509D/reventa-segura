import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import { otpCodes } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { requestOtp, type SmsSender } from './otp';
import { getSmsSender } from './sms';

let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));

import { POST as verifyPost } from '@/app/api/auth/verify/route';
import { POST as requestPost } from '@/app/api/auth/request/route';

const PHONE = '+50761234567';
const URL_V = 'http://localhost/api/auth/verify';

function req(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

class Fake implements SmsSender {
  last = '';
  async send(_p: string, text: string) {
    this.last = /(\d{6})/.exec(text)![1];
  }
}

beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(() => vi.restoreAllMocks());

describe('auth routes', () => {
  it('rejects non-JSON content type with 415 on both routes', async () => {
    const h = { 'content-type': 'text/plain' };
    expect((await verifyPost(req(URL_V, { phone: PHONE, code: '123456' }, h))).status).toBe(415);
    expect((await requestPost(req('http://localhost/api/auth/request', { phone: PHONE }, h))).status).toBe(415);
  });

  it('rejects a foreign Origin with 403 on both routes', async () => {
    const h = { origin: 'https://evil.example' };
    expect((await verifyPost(req(URL_V, { phone: PHONE, code: '123456' }, h))).status).toBe(403);
    expect((await requestPost(req('http://localhost/api/auth/request', { phone: PHONE }, h))).status).toBe(403);
  });

  it('the sixth code request for one phone within the hour is a 429 over HTTP (per-phone budget)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await requestPost(req('http://localhost/api/auth/request', { phone: PHONE }))).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it('a filled honeypot field looks like a success but sends no code and spends no per-phone budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await requestPost(req('http://localhost/api/auth/request', { phone: PHONE, website: 'https://spam.example' }));
      statuses.push(res.status);
      expect(await res.json()).toEqual({ ok: true });
    }
    // Never a 429 (the budget is 5 per hour per phone): none of these counted.
    expect(statuses).toEqual(Array(8).fill(200));
    expect(await db.select().from(otpCodes)).toHaveLength(0);
  });

  it('sets a hardened cookie and keeps the token out of the body', async () => {
    const f = new Fake();
    await requestOtp(db, PHONE, f);
    const res = await verifyPost(
      req(URL_V, { phone: PHONE, code: f.last }, { origin: 'http://localhost' }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    const token = /session=([^;]+)/.exec(cookie)![1];
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${30 * 24 * 3600}`);
    expect(await res.text()).not.toContain(token);
  });

  it('returns an identical 401 body for every verify failure kind', async () => {
    const f = new Fake();
    await requestOtp(db, PHONE, f);
    const wrong = f.last === '000000' ? '111111' : '000000';
    const bodies = [
      await verifyPost(req(URL_V, { phone: PHONE, code: wrong })),
      await verifyPost(req(URL_V, { phone: '+50769999999', code: wrong })), // unknown phone
      await verifyPost(req(URL_V, { phone: '+14155550100', code: wrong })), // foreign phone
    ];
    const texts = await Promise.all(bodies.map(async (r) => [r.status, await r.text()]));
    for (const t of texts) expect(t).toEqual(texts[0]);
    expect(texts[0][0]).toBe(401);
  });

  it('does not log phone numbers from unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db = {
      select: () => {
        throw new Error(`Failed query params: ${PHONE}`);
      },
    } as unknown as Db;
    const res = await verifyPost(req(URL_V, { phone: PHONE, code: '123456' }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('6123');
  });

  it('request route returns 503 when no SMS provider is configured in production', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    const res = await requestPost(req('http://localhost/api/auth/request', { phone: PHONE }));
    vi.unstubAllEnvs();
    expect(res.status).toBe(503);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('6123');
  });
});

describe('getSmsSender', () => {
  it('throws in production and works otherwise', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getSmsSender()).toThrow('SMS provider not configured');
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => getSmsSender()).not.toThrow();
    vi.unstubAllEnvs();
  });
});
