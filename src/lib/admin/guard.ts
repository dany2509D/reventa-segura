import { getSession } from '@/lib/auth/session';
import type { Actor, Db } from '@/lib/db/types';
import { assertAdmin } from '@/lib/authz';
import { ForbiddenError } from '@/lib/errors';

/**
 * Resolves the admin behind a session token or throws ForbiddenError. Always goes through
 * getSession (live role, 8-hour admin lifetime) and requires the 2FA flag: reading the sessions
 * table directly would skip the admin-lifetime rule.
 */
export async function requireAdmin(
  db: Db,
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<Actor> {
  if (!token) throw new ForbiddenError();
  const session = await getSession(db, token, now);
  if (!session) throw new ForbiddenError();
  const actor: Actor = { userId: session.userId, role: session.role, mfa: session.mfa };
  assertAdmin(actor);
  return actor;
}

export type AdminAccess =
  | { state: 'ok'; actor: Actor }
  | { state: 'needs_mfa' }
  | { state: 'denied' };

/**
 * For pages: decides where a visitor goes. 'needs_mfa' is only ever returned to a real admin
 * session, so the TOTP page does not reveal anything to everyone else.
 */
export async function adminAccess(
  db: Db,
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<AdminAccess> {
  if (!token) return { state: 'denied' };
  const session = await getSession(db, token, now);
  if (!session || session.role !== 'admin') return { state: 'denied' };
  const actor: Actor = { userId: session.userId, role: session.role, mfa: session.mfa };
  return session.mfa ? { state: 'ok', actor } : { state: 'needs_mfa' };
}
