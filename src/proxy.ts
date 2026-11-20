import { NextResponse, type NextRequest } from 'next/server';
import { canonicalRedirect } from '@/lib/security/canonical';
import { isPrivatePath } from '@/lib/seo/private-paths';
import { SECURITY_HEADERS, buildCsp, newNonce } from '@/lib/security/headers';
import { siteUrl } from '@/lib/site/site-config';

/**
 * Next 16 proxy (formerly middleware): runs before every page, API route and server action.
 * It mints a fresh CSP nonce per request and hands it to the renderer through the request's
 * Content-Security-Policy header, from which Next.js reads it and stamps it on its own scripts
 * (pages are rendered per request for this reason: see the root layout). The same policy and the
 * static security headers go on the response. Authorization is NOT done here: every route and
 * server action checks the session itself.
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    // One address per page: HTTP → HTTPS and www ↔ apex → the host in SITE_URL, permanently (301).
    const target = canonicalRedirect({
      url: request.nextUrl,
      method: request.method,
      forwardedProto: request.headers.get('x-forwarded-proto'),
      host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
      siteUrl: siteUrl(),
    });
    if (target) return NextResponse.redirect(target, 301);

    // Sandbox routes do not exist in production, whatever env flags are set.
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
  // Account, checkout, order and admin pages never belong in search results (public pages carry no such header).
  if (isPrivatePath(request.nextUrl.pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // Pages, server actions and public files. API routes and build assets get the same headers
  // (nonce-less CSP) from next.config.ts instead: headers set here would override a route
  // handler's own, stricter ones (e.g. the private-file route's `sandbox` CSP), while
  // next.config headers yield to them.
  matcher: ['/((?!api/|_next/static/|_next/image|favicon\\.ico).*)'],
};
