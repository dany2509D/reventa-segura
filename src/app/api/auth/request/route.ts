import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { InvalidPhoneError, RateLimitError } from '@/lib/auth/errors';
import { ConsoleSmsSender, requestOtp } from '@/lib/auth/otp';

const body = z.object({ phone: z.string().min(1).max(32) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
  }
  try {
    await requestOtp(getDb(), parsed.data.phone, new ConsoleSmsSender());
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
    throw e;
  }
}
