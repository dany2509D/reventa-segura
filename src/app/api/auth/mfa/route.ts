import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/request-session';
import { getSession } from '@/lib/auth/session';
import { completeMfa } from '@/lib/auth/totp';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { getDb } from '@/lib/db/client';
import { rateLimit } from '@/lib/security/rate-limit';

const body = z.object({ code: z.string().regex(/^\d{6}$/) });

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

const json = (b: object, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(b, { status, headers: { 'cache-control': 'no-store', ...headers } });

// Second step of the admin login: the session already passed the SMS code; this call proves the
// TOTP code and upgrades that session to a full admin session. A 6-digit code is brute-forceable,
// so attempts are limited per user (5 per 15 minutes) and the 6th is refused even if correct.
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const token = readSessionToken(req);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Código inválido' }, 400);
    if (!token) return json({ error: 'No autorizado' }, 401);

    const db = getDb();
    const session = await getSession(db, token);
    if (!session) return json({ error: 'No autorizado' }, 401);

    const limit = await rateLimit(db, `mfa:${session.userId}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!limit.allowed) {
      return json({ error: 'Demasiados intentos. Intenta más tarde.' }, 429, {
        'retry-after': String(limit.retryAfterSeconds),
      });
    }
    const ok = await completeMfa(db, token, parsed.data.code);
    return ok ? json({ ok: true }, 200) : json({ error: 'No autorizado' }, 401);
  } catch (e) {
    return internalError(e);
  }
}
