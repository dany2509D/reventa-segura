import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { InvalidPhoneError, RateLimitError, SmsCapError } from '@/lib/auth/errors';
import { requestOtp } from '@/lib/auth/otp';
import { SmsConfigError, getSmsSender } from '@/lib/auth/sms';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { alert, log } from '@/lib/observability/log';
import { getClientIp } from '@/lib/security/client-ip';
import { LIMITS, limitOr429 } from '@/lib/security/limits';

// `website` is a honeypot: a field no person ever sees or fills (it is hidden in the login form), so a
// value in it means a script filled in every input it found.
const body = z.object({ phone: z.string().min(1).max(32), website: z.string().max(500).optional() });

const UNAVAILABLE = 'Servicio no disponible por el momento.';

// Sends a login code by SMS. Three budgets protect the SMS spend (SEG-07): per client IP (here),
// per phone and platform-wide per 24 h (both inside requestOtp).
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const limited = await limitOr429(getDb(), LIMITS.otpRequestIp, getClientIp(req));
    if (limited) return limited;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
    }
    // A bot gets the same answer as a person, but no code is sent and no SMS or per-phone budget is spent.
    if (parsed.data.website) return NextResponse.json({ ok: true });
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
    if (e instanceof SmsCapError) {
      alert('sms_daily_cap_reached', { cap: e.cap });
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (e instanceof SmsConfigError) {
      log('error', 'auth route error', { error: e.name });
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    return internalError(e);
  }
}
