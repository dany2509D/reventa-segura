import { NextResponse } from 'next/server';

function originMatchesHost(req: Request, origin: string): boolean {
  const host = req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// CSRF guard for cookie-setting POST routes: JSON content type only, and a
// present Origin header must match the request host.
export function rejectUnsafeRequest(req: Request): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(ct)) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  const origin = req.headers.get('origin');
  if (origin !== null && !originMatchesHost(req, origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// CSRF guard for authenticated multipart uploads. multipart/form-data is a
// CORS-safelisted type, so the Origin header is mandatory and must match.
export function rejectUnsafeUpload(req: Request): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(ct)) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  const origin = req.headers.get('origin');
  if (origin === null || !originMatchesHost(req, origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// Never log the error message: drizzle includes bound parameters (phone numbers).
export function internalError(e: unknown): NextResponse {
  console.error('auth route error', e instanceof Error ? e.name : 'UnknownError');
  return NextResponse.json({ error: 'Error interno. Intenta de nuevo.' }, { status: 500 });
}
