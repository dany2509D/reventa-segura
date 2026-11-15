import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { verifyOtp } from '@/lib/auth/otp';
import { getSession, sessionTtlMs } from '@/lib/auth/session';

const body = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }
  const db = getDb();
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
}
