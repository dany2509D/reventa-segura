import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, ADMIN_SESSION_MS } from '@/lib/auth/session';
import { sessions, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';
import { requireAdmin } from './guard';

let db: Db;
let n = 0;
const mk = async (role: 'user' | 'admin') => {
  n += 1;
  const [u] = await db.insert(users).values({ phone: `+5076${String(n).padStart(7, '0')}`, role }).returning();
  return u;
};
const withMfa = (token: string) =>
  db.select().from(sessions).then(async () => {
    // mfa is stored on the session row; flip it for the session whose token we just minted
    const { hashToken } = await import('@/lib/auth/session');
    await db.update(sessions).set({ mfa: true }).where(eq(sessions.tokenHash, hashToken(token)));
  });

beforeEach(async () => {
  db = await makeTestDb();
});

describe('requireAdmin', () => {
  it.each([null, undefined, '', 'not-a-real-token'])('rejects a missing or unknown token (%j)', async (t) => {
    await expect(requireAdmin(db, t)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a normal user, even with the mfa flag set', async () => {
    const u = await mk('user');
    const token = await createSession(db, u.id, 'user');
    await withMfa(token);
    await expect(requireAdmin(db, token)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an admin whose session has not passed the second factor', async () => {
    const a = await mk('admin');
    const token = await createSession(db, a.id, 'admin');
    await expect(requireAdmin(db, token)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('accepts an admin session that completed 2FA and returns the actor', async () => {
    const a = await mk('admin');
    const token = await createSession(db, a.id, 'admin');
    await withMfa(token);
    await expect(requireAdmin(db, token)).resolves.toEqual({ userId: a.id, role: 'admin', mfa: true });
  });

  it('rejects an admin session older than 8 hours (reads the live session rule)', async () => {
    const a = await mk('admin');
    const created = new Date(Date.now() - ADMIN_SESSION_MS - 60_000);
    const token = await createSession(db, a.id, 'user', created); // 30-day session minted while a user
    await withMfa(token);
    await expect(requireAdmin(db, token)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a demoted admin immediately', async () => {
    const a = await mk('admin');
    const token = await createSession(db, a.id, 'admin');
    await withMfa(token);
    await db.update(users).set({ role: 'user' }).where(eq(users.id, a.id));
    await expect(requireAdmin(db, token)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
