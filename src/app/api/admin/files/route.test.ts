import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, hashToken } from '@/lib/auth/session';
import { sessions, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
const { GET } = await import('./route');

let n = 0;
async function sessionFor(role: 'user' | 'admin', mfa: boolean) {
  n += 1;
  const [u] = await h.db.insert(users).values({ phone: `+5076${String(n).padStart(7, '0')}`, role }).returning();
  const token = await createSession(h.db, u.id, role);
  if (mfa) await h.db.update(sessions).set({ mfa: true }).where(eq(sessions.tokenHash, hashToken(token)));
  return token;
}
const filePath = () => `identity/${randomUUID()}/${randomUUID()}`;
const get = (token: string | null, path: string | null) =>
  GET(
    new Request(`http://localhost/api/admin/files${path === null ? '' : `?path=${encodeURIComponent(path)}`}`, {
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  );

beforeEach(async () => {
  h.db = await makeTestDb();
  vi.stubEnv('FILE_URL_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/files', () => {
  it('redirects an admin (with 2FA) to a short-lived signed file URL', async () => {
    const res = await get(await sessionFor('admin', true), filePath());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/^\/api\/files\/[\w-]+\.[\w-]+$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['no session', async () => null],
    ['a normal user', () => sessionFor('user', true)],
    ['an admin without 2FA', () => sessionFor('admin', false)],
  ])('answers 404 for %s, revealing nothing', async (_name, mint) => {
    const res = await get(await mint(), filePath());
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it.each([null, '', 'not-a-path', '../../etc/passwd', 'identity/x/y'])('answers 404 for a bad path (%j)', async (p) => {
    expect((await get(await sessionFor('admin', true), p)).status).toBe(404);
  });
});
