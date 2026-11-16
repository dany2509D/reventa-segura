import { describe, expect, it, vi } from 'vitest';
import { STATE_CHANGING, discoverApiHandlers, type ApiHandler } from '@/lib/testing/api-routes';

/*
 * SEG-17: every state-changing route handler (POST/PUT/PATCH/DELETE) under src/app/api is guarded
 * against cross-site requests, and the guard runs before anything else. Routes are discovered by
 * walking the directory: a new unguarded route fails here until it is added to GUARDS.
 *
 * Server actions (src/app/admin, src/app/pago-de-prueba) are not route handlers: Next.js rejects
 * them unless the Origin header matches the host (see docs/launch-checklist.md).
 */

type Guard =
  | 'json' // rejectUnsafeRequest: application/json only (415), a present Origin must match (403)
  | 'multipart' // rejectUnsafeUpload: multipart only (415), Origin mandatory and matching (403)
  | 'origin' // rejectCrossOrigin: body-less; Origin mandatory and matching (403)
  | 'signature'; // machine caller authenticated by a provider signature; no cookies involved

const GUARDS: Record<string, Guard> = {
  'POST /api/auth/logout': 'json',
  'POST /api/auth/mfa': 'json',
  'POST /api/auth/phone/verify': 'json',
  'POST /api/auth/request': 'json',
  'POST /api/auth/test-code': 'json', // login-code TEST MODE only; 404 (before the guard) when the mode is off
  'POST /api/auth/verify': 'json',
  'POST /api/checkout': 'json',
  'POST /api/identity': 'multipart',
  'POST /api/listings': 'multipart',
  'DELETE /api/listings/[id]': 'origin',
  'POST /api/orders/[id]/dispute': 'multipart',
  'POST /api/orders/[id]/entry': 'multipart',
  'POST /api/orders/[id]/proof': 'multipart',
  'POST /api/orders/[id]/received': 'multipart',
  'POST /api/orders/manual': 'json',
  'POST /api/webhooks/payments': 'signature',
};

// Any database access before the guard would throw here and surface as a 500, not a 403/415.
vi.mock('@/lib/db/client', () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get() {
          throw new Error('database touched before the CSRF guard');
        },
      },
    ),
}));

// The test-code route answers an empty 404 unless login-code test mode is on: turn it on so its guard is reachable.
vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', '1');

const all = await discoverApiHandlers();
const stateChanging = all.filter((h) => (STATE_CHANGING as readonly string[]).includes(h.method));

const BASE = 'http://localhost';
const ctx = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000', token: 'x' }) };

function call(h: ApiHandler, headers: Record<string, string>, body?: BodyInit) {
  const url = `${BASE}${h.path.replace(/\[(\w+)\]/g, 'x')}`;
  // A session cookie is present: the guard must not depend on the caller being anonymous.
  const req = new Request(url, { method: h.method, headers: { host: 'localhost', cookie: 'session=abc', ...headers }, body });
  return h.handler(req, ctx);
}

const multipartBody = () => {
  const fd = new FormData();
  fd.append('reason', 'x');
  return fd;
};

describe('CSRF guard table (SEG-17)', () => {
  it('finds the route handlers', () => {
    expect(stateChanging.length).toBeGreaterThanOrEqual(12);
  });

  it('lists every state-changing handler, and only existing ones', () => {
    const found = stateChanging.map((h) => h.key).sort();
    expect(found).toEqual(Object.keys(GUARDS).sort());
  });
});

describe.each(stateChanging.filter((h) => GUARDS[h.key] === 'json'))('$key (JSON guard)', (h) => {
  it('403 for a foreign or opaque Origin', async () => {
    for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example']) {
      const res = await call(h, { 'content-type': 'application/json', origin }, '{}');
      expect(res.status, origin).toBe(403);
    }
  });

  it('415 for the content types a cross-site HTML form can send', async () => {
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await call(h, { 'content-type': ct, origin: BASE }, '{}');
      expect(res.status, ct).toBe(415);
    }
  });
});

describe.each(stateChanging.filter((h) => GUARDS[h.key] === 'multipart'))('$key (upload guard)', (h) => {
  it('403 for a foreign Origin and for a missing Origin (multipart is CORS-safelisted)', async () => {
    expect((await call(h, { origin: 'https://evil.example' }, multipartBody())).status).toBe(403);
    expect((await call(h, {}, multipartBody())).status).toBe(403);
  });

  it('415 for a non-multipart body', async () => {
    for (const ct of ['application/json', 'text/plain', 'application/x-www-form-urlencoded']) {
      expect((await call(h, { 'content-type': ct, origin: BASE }, '{}')).status, ct).toBe(415);
    }
  });
});

describe.each(stateChanging.filter((h) => GUARDS[h.key] === 'origin'))('$key (Origin guard)', (h) => {
  it('403 for a foreign or missing Origin', async () => {
    expect((await call(h, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(h, {})).status).toBe(403);
  });
});

describe.each(stateChanging.filter((h) => GUARDS[h.key] === 'signature'))('$key (signature)', (h) => {
  it('400 for a cross-site form post without a valid provider signature', async () => {
    process.env.FAKE_GATEWAY_SECRET = 'csrf-test-secret';
    const res = await call(h, { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, 'a=b');
    expect(res.status).toBe(400);
  });
});
