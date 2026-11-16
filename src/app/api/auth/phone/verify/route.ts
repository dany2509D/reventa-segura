import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { normalizePanamaPhone } from '@/lib/auth/phone';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyFirebaseIdToken } from '@/lib/firebase/verify-id-token';
import { rateLimit } from '@/lib/security/rate-limit';

const FAKE_CODE = '123456';
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

const fakeBody = z.object({ phone: z.string().min(1), fakeCode: z.string() });
const realBody = z.object({ idToken: z.string().min(20) });

const json = (b: object, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(b, { status, headers: { 'cache-control': 'no-store', ...headers } });

// The fake mode only ever works outside production, even if ALLOW_FAKE_SMS=true is set there.
const fakeSmsEnabled = () => process.env.ALLOW_FAKE_SMS === 'true' && process.env.NODE_ENV !== 'production';

// Marks the signed-in user's phone as verified.
//  - ALLOW_FAKE_SMS=true (development): { phone, fakeCode: "123456" }.
//  - otherwise: { idToken } from Firebase Phone Auth, verified server-side (aud = FIREBASE_PROJECT_ID).
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const raw = await req.json().catch(() => null);
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'No autorizado' }, 401);

    const limit = await rateLimit(db, `phone-verify:${actor.userId}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!limit.allowed) {
      return json({ error: 'Demasiados intentos. Intenta más tarde.' }, 429, {
        'retry-after': String(limit.retryAfterSeconds),
      });
    }

    let phone: string | null;
    if (fakeSmsEnabled()) {
      const parsed = fakeBody.safeParse(raw);
      if (!parsed.success) return json({ error: 'Datos inválidos' }, 400);
      if (parsed.data.fakeCode !== FAKE_CODE) return json({ error: 'Código incorrecto' }, 401);
      phone = normalizePanamaPhone(parsed.data.phone);
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      if (!projectId) return json({ error: 'Verificación de teléfono no configurada' }, 503);
      const parsed = realBody.safeParse(raw);
      if (!parsed.success) return json({ error: 'Datos inválidos' }, 400);
      const token = await verifyFirebaseIdToken(parsed.data.idToken, projectId);
      if (!token?.phoneNumber) return json({ error: 'Token inválido' }, 401);
      phone = normalizePanamaPhone(token.phoneNumber);
    }
    if (!phone) return json({ error: 'Número de teléfono inválido' }, 400);

    try {
      await db.update(users).set({ phone, phoneVerifiedAt: new Date() }).where(eq(users.id, actor.userId));
    } catch (e) {
      // 23505 = unique_violation: another account already owns this number.
      if ((e as { code?: string; cause?: { code?: string } })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505') {
        return json({ error: 'Este número ya está registrado' }, 409);
      }
      throw e;
    }
    return json({ ok: true, phone }, 200);
  } catch (e) {
    return internalError(e);
  }
}
