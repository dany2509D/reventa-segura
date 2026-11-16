import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, getSession } from '@/lib/auth/session';
import { users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
const { POST } = await import('./route');

const call = (token: string | null, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost', ...(token ? { cookie: `session=${token}` } : {}), ...headers },
      body: '{}',
    }),
  );

beforeEach(async () => {
  h.db = await makeTestDb();
});

describe('POST /api/auth/logout', () => {
  it('revokes the session server-side and clears the cookie', async () => {
    const [u] = await h.db.insert(users).values({ phone: '+50761230001' }).returning();
    const token = await createSession(h.db, u.id, 'user');
    expect(await getSession(h.db, token)).not.toBeNull();

    const res = await call(token);

    expect(res.status).toBe(200);
    expect(await getSession(h.db, token)).toBeNull();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('is fine without a session (idempotent) and still clears the cookie', async () => {
    const res = await call(null);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i);
  });

  it('refuses cross-site and non-JSON requests (logout CSRF)', async () => {
    const [u] = await h.db.insert(users).values({ phone: '+50761230002' }).returning();
    const token = await createSession(h.db, u.id, 'user');
    expect((await call(token, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(token, { 'content-type': 'text/plain' })).status).toBe(415);
    expect(await getSession(h.db, token)).not.toBeNull();
  });
});
