import { NextResponse } from 'next/server';

// CSRF guard for cookie-setting POST routes: JSON content type only, and a
// present Origin header must match the request host.
export function rejectUnsafeRequest(req: Request): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(ct)) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  const origin = req.headers.get('origin');
  if (origin !== null) {
    const host = req.headers.get('host') ?? new URL(req.url).host;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {}
    if (originHost !== host) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  return null;
}

// Never log the error message: drizzle includes bound parameters (phone numbers).
export function internalError(e: unknown): NextResponse {
  console.error('auth route error', e instanceof Error ? e.name : 'UnknownError');
  return NextResponse.json({ error: 'Error interno. Intenta de nuevo.' }, { status: 500 });
}
