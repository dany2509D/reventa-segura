import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyOtp } from '@/lib/auth/otp';
import { normalizePanamaPhone } from '@/lib/auth/phone';
import { createSession, getSession, sessionTtlMs } from '@/lib/auth/session';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { verifyFirebaseIdToken } from '@/lib/firebase/verify-id-token';
import { getClientIp } from '@/lib/security/client-ip';
import { LIMITS, limitOr429 } from '@/lib/security/limits';

const legacyBody = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().regex(/^\d{6}$/),
});
const firebaseBody = z.object({ idToken: z.string().min(20).max(4096) });

// The fake mode only ever works outside production, even if ALLOW_FAKE_SMS=true is set there.
const fakeSmsEnabled = () => process.env.ALLOW_FAKE_SMS === 'true' && process.env.NODE_ENV !== 'production';

// Verifies a login code.
//  - ALLOW_FAKE_SMS=true: legacy flow { phone, code }. Each code allows 5 attempts (verifyOtp).
//  - otherwise: { idToken } from Firebase Phone Auth, verified server-side (aud = FIREBASE_PROJECT_ID);
//    the user is found or created by the token's phone number.
// Both paths cap attempts per client IP, so one client cannot spray guesses (SEG-07).
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const limited = await limitOr429(db, LIMITS.otpVerifyIp, getClientIp(req));
    if (limited) return limited;
    const raw = await req.json().catch(() => null);

    let sessionToken: string;
    if (fakeSmsEnabled()) {
      const parsed = legacyBody.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
      }
      const result = await verifyOtp(db, parsed.data.phone, parsed.data.code);
      if (!result) {
        return NextResponse.json({ error: 'Código inválido o vencido' }, { status: 401 });
      }
      sessionToken = result.sessionToken;
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      if (!projectId) {
        return NextResponse.json({ error: 'Verificación de teléfono no configurada' }, { status: 503 });
      }
      const parsed = firebaseBody.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
      }
      const token = await verifyFirebaseIdToken(parsed.data.idToken, projectId);
      const phone = token?.phoneNumber ? normalizePanamaPhone(token.phoneNumber) : null;
      if (!phone) {
        return NextResponse.json({ error: 'Código inválido o vencido' }, { status: 401 });
      }
      const now = new Date();
      const [user] = await db
        .insert(users)
        .values({ phone, phoneVerifiedAt: now })
        .onConflictDoUpdate({ target: users.phone, set: { phoneVerifiedAt: now } })
        .returning();
      sessionToken = await createSession(db, user.id, user.role, now);
    }

    const session = await getSession(db, sessionToken);
    const role = session?.role ?? 'user';

    // The token travels only in the httpOnly cookie, never in the JSON body.
    const res = NextResponse.json({ ok: true, role, mfaRequired: role === 'admin' });
    res.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(sessionTtlMs(role) / 1000),
    });
    return res;
  } catch (e) {
    return internalError(e);
  }
}
