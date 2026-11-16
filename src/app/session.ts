import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/auth/request-session';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';

export type CurrentUser = { userId: string; role: 'user' | 'admin' };

/** The signed-in member behind the session cookie, or null. Server components and actions only. */
export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await getSession(getDb(), token);
  return s ? { userId: s.userId, role: s.role } : null;
}

/** Same as currentUser, but sends visitors to the login page and back to `next` afterwards. */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect(`/ingresar?next=${encodeURIComponent(safeNext(next))}`);
  return user;
}

/** Only same-site relative paths are valid redirect targets (no open redirect). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
