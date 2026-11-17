import { NextResponse, type NextRequest } from 'next/server';
import { SECURITY_HEADERS, buildCsp, newNonce } from '@/lib/security/headers';

/**
 * Next 16 proxy (formerly middleware): runs before every page, API route and server action.
 * It mints a fresh CSP nonce per request and hands it to the renderer through the request's
 * Content-Security-Policy header, from which Next.js reads it and stamps it on its own scripts
 * (pages are rendered per request for this reason: see the root layout). The same policy and the
 * static security headers go on the response. Authorization is NOT done here: every route and
 * server action checks the session itself.
 */
export function proxy(request: NextRequest) {
  // Sandbox routes do not exist in production, whatever env flags are set.
  if (process.env.NODE_ENV === 'production') {
    const p = request.nextUrl.pathname;
    if (p === '/pago-de-prueba' || p.startsWith('/pago-de-prueba/')) {
      return new NextResponse(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
  }
  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === 'development' });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce); // overwrites anything the client sent
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Pages, server actions and public files. API routes and build assets get the same headers
  // (nonce-less CSP) from next.config.ts instead: headers set here would override a route
  // handler's own, stricter ones (e.g. the private-file route's `sandbox` CSP), while
  // next.config headers yield to them.
  matcher: ['/((?!api/|_next/static/|_next/image|favicon\\.ico).*)'],
};
