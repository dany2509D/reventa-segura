import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminAccess } from '@/lib/admin/guard';
import { SESSION_COOKIE } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import type { Actor } from '@/lib/db/types';

/**
 * Gate for every admin page and server action: returns the admin (role admin + 2FA done) or
 * redirects. A visitor who is not an admin is sent home without being told the area exists.
 */
export async function requireAdminPage(): Promise<Actor> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const access = await adminAccess(getDb(), token);
  if (access.state === 'ok') return access.actor;
  redirect(access.state === 'needs_mfa' ? '/admin/mfa' : '/');
}

/** For the TOTP page: only an admin session that still needs the second factor may see it. */
export async function requireAdminNeedingMfa(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const access = await adminAccess(getDb(), token);
  if (access.state === 'ok') redirect('/admin');
  if (access.state === 'denied') redirect('/');
}
