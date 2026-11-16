import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { verifyOtp } from '@/lib/auth/otp';
import { getSession, sessionTtlMs } from '@/lib/auth/session';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { getClientIp } from '@/lib/security/client-ip';
import { LIMITS, limitOr429 } from '@/lib/security/limits';

const body = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().regex(/^\d{6}$/),
});

// Verifies a login code. Each code allows 5 attempts (verifyOtp); this route also caps attempts
// per client IP, so one client cannot spray guesses over many phones (SEG-07).
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const limited = await limitOr429(db, LIMITS.otpVerifyIp, getClientIp(req));
    if (limited) return limited;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }
    const result = await verifyOtp(db, parsed.data.phone, parsed.data.code);
    if (!result) {
      return NextResponse.json({ error: 'Código inválido o vencido' }, { status: 401 });
    }
    const session = await getSession(db, result.sessionToken);
    const role = session?.role ?? 'user';

    // The token travels only in the httpOnly cookie, never in the JSON body.
    const res = NextResponse.json({ ok: true, role, mfaRequired: role === 'admin' });
    const env = process.env.NODE_ENV;
    res.cookies.set('session', result.sessionToken, {
      httpOnly: true,
      secure: env !== 'development' && env !== 'test',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(sessionTtlMs(role) / 1000),
    });
    return res;
  } catch (e) {
    return internalError(e);
  }
}
