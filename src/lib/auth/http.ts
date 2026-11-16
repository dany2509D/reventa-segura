import { NextResponse } from 'next/server';
import { errorName, log } from '@/lib/observability/log';

/*
 * CSRF guards (SEG-17). Every cookie-authenticated, state-changing route handler starts with one:
 *  - JSON bodies: rejectUnsafeRequest (application/json is not CORS-safelisted, so a cross-site
 *    page cannot send it without a preflight; a present Origin must match).
 *  - multipart uploads: rejectUnsafeUpload (multipart IS safelisted, so Origin is mandatory).
 *  - body-less requests (DELETE): rejectCrossOrigin (Origin mandatory).
 * Exempt by design: the payment webhook (provider signature) and the cron route (bearer secret).
 * Server actions (admin panel, test-payment page) rely on Next's built-in Origin check.
 * src/app/api/csrf.test.ts walks src/app/api and fails for any unguarded new route.
 */

function originMatchesHost(req: Request, origin: string): boolean {
  const host = req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

// JSON content type only, and a present Origin header must match the request host.
export function rejectUnsafeRequest(req: Request): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(ct)) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  const origin = req.headers.get('origin');
  if (origin !== null && !originMatchesHost(req, origin)) return forbidden();
  return null;
}

// Authenticated multipart uploads: the Origin header is mandatory and must match.
export function rejectUnsafeUpload(req: Request): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(ct)) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
  }
  return rejectCrossOrigin(req);
}

// Body-less state changes (DELETE): browsers send Origin on every non-GET fetch, so it is
// mandatory and must match the request host.
export function rejectCrossOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  if (origin === null || !originMatchesHost(req, origin)) return forbidden();
  return null;
}

// Never log the error message: drizzle includes bound parameters (phone numbers).
export function internalError(e: unknown): NextResponse {
  log('error', 'auth route error', { error: errorName(e) });
  return NextResponse.json({ error: 'Error interno. Intenta de nuevo.' }, { status: 500 });
}
