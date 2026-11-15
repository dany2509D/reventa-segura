import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';

export const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

export type Role = 'user' | 'admin';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionTtlMs(role: Role): number {
  return role === 'admin' ? ADMIN_SESSION_MS : USER_SESSION_MS;
}

export async function createSession(
  db: Db,
  userId: string,
  role: Role,
  now: Date = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    mfa: false,
    expiresAt: new Date(now.getTime() + sessionTtlMs(role)),
  });
  return token;
}

export async function getSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string; role: Role; mfa: boolean } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ userId: users.id, role: users.role, mfa: sessions.mfa })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)));
  return row ?? null;
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
