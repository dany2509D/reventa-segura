import type { Actor } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';

// True only for an admin whose session completed the TOTP second factor (SEG-04).
export function isAdmin(actor: Actor): boolean {
  return actor.role === 'admin' && actor.mfa === true;
}

// Every admin action calls this first; a non-admin or an admin session without
// 2FA gets a ForbiddenError before any input is looked at.
export function assertAdmin(actor: Actor): void {
  if (!isAdmin(actor)) throw new ForbiddenError();
}
