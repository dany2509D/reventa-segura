import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '@/lib/admin/guard';
import { createSession } from '@/lib/auth/session';
import { enrollTotp } from '@/lib/auth/totp';
import { users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
const { POST } = await import('./route');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string, atMs = Date.now()): string {
  let bits = '';
  for (const c of secret) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000)));
  const mac = createHmac('sha1', key).update(msg).digest();
  const o = mac[mac.length - 1] & 0xf;
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

const call = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/auth/mfa', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'localhost',
        ...(token ? { cookie: `session=${token}` } : {}),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

let n = 0;
async function adminWithSession() {
  n += 1;
  const [u] = await h.db.insert(users).values({ phone: `+5076${String(n).padStart(7, '0')}`, role: 'admin' }).returning();
  const { secret } = await enrollTotp(h.db, u.id);
  const token = await createSession(h.db, u.id, 'admin');
  return { u, secret, token };
}

beforeEach(async () => {
  h.db = await makeTestDb();
});

describe('POST /api/auth/mfa', () => {
  it('401 without a session cookie', async () => {
    expect((await call(null, { code: '123456' })).status).toBe(401);
  });

  it('415 for a non-JSON body and 403 for a foreign Origin', async () => {
    const { token } = await adminWithSession();
    expect((await call(token, '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call(token, { code: '123456' }, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('400 for a malformed code, without counting an attempt', async () => {
    const { token, secret } = await adminWithSession();
    for (const code of ['12345', '1234567', 'abcdef', '', 123456 as unknown as string]) {
      expect((await call(token, { code })).status).toBe(400);
    }
    expect((await call(token, { code: totp(secret) })).status).toBe(200); // five bad inputs did not lock it
  });

  it('a correct code upgrades the session to a full admin session', async () => {
    const { u, token, secret } = await adminWithSession();
    await expect(requireAdmin(h.db, token)).rejects.toThrow();
    const res = await call(token, { code: totp(secret) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await expect(requireAdmin(h.db, token)).resolves.toEqual({ userId: u.id, role: 'admin', mfa: true });
  });

  it('a wrong code is a 401 and the session stays without 2FA', async () => {
    const { token, secret } = await adminWithSession();
    const wrong = totp(secret, Date.now() + 10 * 60_000); // a code from the future
    const res = await call(token, { code: wrong });
    expect(res.status).toBe(401);
    await expect(requireAdmin(h.db, token)).rejects.toThrow();
  });

  it('a normal user cannot use it (401, same as any failure)', async () => {
    const [u] = await h.db.insert(users).values({ phone: '+50769999999' }).returning();
    const token = await createSession(h.db, u.id, 'user');
    expect((await call(token, { code: '123456' })).status).toBe(401);
  });

  it('locks out after 5 attempts: the 6th is a 429 with Retry-After even if it is the correct code', async () => {
    const { token, secret } = await adminWithSession();
    const wrong = totp(secret, Date.now() + 10 * 60_000);
    for (let i = 0; i < 5; i++) expect((await call(token, { code: wrong })).status).toBe(401);
    const locked = await call(token, { code: totp(secret) });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(requireAdmin(h.db, token)).rejects.toThrow();
  });

  it('the attempt budget is per admin, not shared', async () => {
    const a = await adminWithSession();
    const b = await adminWithSession();
    const wrong = totp(a.secret, Date.now() + 10 * 60_000);
    for (let i = 0; i < 6; i++) await call(a.token, { code: wrong });
    expect((await call(b.token, { code: totp(b.secret) })).status).toBe(200);
  });
});
