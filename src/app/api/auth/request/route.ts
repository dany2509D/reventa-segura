import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { InvalidPhoneError, RateLimitError } from '@/lib/auth/errors';
import { requestOtp } from '@/lib/auth/otp';
import { SmsConfigError, getSmsSender } from '@/lib/auth/sms';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';

const body = z.object({ phone: z.string().min(1).max(32) });

export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
  }
  try {
    await requestOtp(getDb(), parsed.data.phone, getSmsSender());
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidPhoneError) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
    }
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429 },
      );
    }
    if (e instanceof SmsConfigError) {
      console.error('auth route error', e.name);
      return NextResponse.json(
        { error: 'Servicio no disponible por el momento.' },
        { status: 503 },
      );
    }
    return internalError(e);
  }
}
