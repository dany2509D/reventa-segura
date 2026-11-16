import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { mayRevealAdminLoginCode } from '@/lib/auth/admin-test-key';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { normalizePanamaPhone } from '@/lib/auth/phone';
import { isLoginCodeTestMode, peekCapturedLoginCode } from '@/lib/auth/test-mode';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { getClientIp } from '@/lib/security/client-ip';
import { rateLimit } from '@/lib/security/rate-limit';

/*
 * LOGIN-CODE TEST MODE ONLY (see src/lib/auth/test-mode.ts): returns the login code that would
 * have been sent by SMS, so it can be shown on screen while no SMS provider exists.
 * Off → an empty 404 for every request, before anything else (production behaviour).
 * POST with a JSON body rather than GET ?phone=: the phone number stays out of URLs and request
 * logs, and a cross-site page cannot send JSON here without a CORS preflight.
 * Never consumes the code (the login still verifies it normally).
 * An admin phone only from the owner's computer: the local TEST_MODE_ADMIN_KEY in the
 * x-test-admin-key header, never in a production build (src/lib/auth/admin-test-key.ts; sent by
 * `npm run admin:code`). The admin still needs TOTP afterwards.
 * Every refusal is the same empty 404 (feature off, no code, not allowed, wrong key): no oracle.
 * The rate limit runs before the key check, so key guesses count like any other call.
 */

const LIMIT_PER_MINUTE = 10;

const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  if (!isLoginCodeTestMode()) return notFound();
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const limit = await rateLimit(db, `test-code:${getClientIp(req)}`, LIMIT_PER_MINUTE, 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds), 'cache-control': 'no-store' } },
      );
    }
    const body = (await req.json().catch(() => null)) as { phone?: unknown } | null;
    const phone = typeof body?.phone === 'string' ? normalizePanamaPhone(body.phone) : null;
    if (!phone) return notFound();
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.phone, phone));
    if (user?.role === 'admin' && !mayRevealAdminLoginCode(req)) return notFound();
    const code = peekCapturedLoginCode(phone);
    if (!code) return notFound();
    return NextResponse.json({ code }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return internalError(e);
  }
}
