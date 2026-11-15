import type { Actor, Db } from '@/lib/db/types';
import { getSession } from './session';

// Name of the httpOnly cookie set by /api/auth/verify.
export const SESSION_COOKIE = 'session';

export function readSessionToken(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      return null;
    }
  }
  return null;
}

// Resolves the caller from the session cookie; null when absent, expired or revoked.
export async function sessionFromRequest(
  db: Db,
  req: Request,
  now: Date = new Date(),
): Promise<Actor | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  return getSession(db, token, now);
}
