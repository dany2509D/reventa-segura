import { createHash, timingSafeEqual } from 'node:crypto';
import { isLoginCodeTestMode } from './test-mode';

/*
 * ADMIN LOGIN CODE IN LOGIN-CODE TEST MODE — only on the owner's development computer.
 * /api/auth/test-code never reveals an admin's code, except when ALL of these hold:
 *  - login-code test mode is on (see test-mode.ts);
 *  - NODE_ENV is not "production": a production build never qualifies, whatever the flags
 *    (ALLOW_TEST_LOGIN_CODES does NOT apply here);
 *  - TEST_MODE_ADMIN_KEY is set (>= 32 characters; it lives only in the owner's git-ignored
 *    .env.local, created by `npm run admin:code -- --init`);
 *  - the request carries that same key in the x-test-admin-key header (`npm run admin:code` sends it).
 * "This computer" is decided by the secret, not by IP or Host headers: anyone on the LAN can reach
 * the dev server and forge those. The admin still needs the TOTP second factor after the code.
 * The key, the code and the phone are never logged.
 */

export const ADMIN_TEST_KEY_HEADER = 'x-test-admin-key';
export const ADMIN_TEST_KEY_MIN_LENGTH = 32;

type Env = Readonly<Record<string, string | undefined>>;

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function isUsableAdminTestKey(key: string | undefined): key is string {
  return typeof key === 'string' && key.length >= ADMIN_TEST_KEY_MIN_LENGTH;
}

export function mayRevealAdminLoginCode(req: Request, env: Env = process.env): boolean {
  // `process.env.NODE_ENV` is inlined as "production" by `next build`, so in a production build this
  // returns false unconditionally; `env.NODE_ENV` covers callers that pass their own environment.
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') return false;
  if (!isLoginCodeTestMode(env)) return false;
  const key = env.TEST_MODE_ADMIN_KEY;
  if (!isUsableAdminTestKey(key)) return false;
  // Hashing first gives equal-length buffers, so the comparison time does not depend on the input.
  return timingSafeEqual(digest(req.headers.get(ADMIN_TEST_KEY_HEADER) ?? ''), digest(key));
}
