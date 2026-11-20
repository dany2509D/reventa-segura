/**
 * Browser security headers (SEG-16). The proxy (src/proxy.ts) sends them with a per-request nonce
 * on every page and API response; next.config.ts sends the same set, without a nonce, on the build
 * assets the proxy skips. Keep this file free of Node-only imports: next.config.ts loads it too.
 */

import { analyticsId } from '../site/site-config';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Camera (ticket photos) and location (entry signal) are asked for by our own pages only.
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=()',
  // Legacy twin of frame-ancestors 'none' for old browsers.
  'X-Frame-Options': 'DENY',
};

/**
 * Content-Security-Policy. Scripts run only with the request's nonce ('strict-dynamic' lets those
 * scripts load Next's chunks); never 'unsafe-inline'. Styles keep 'unsafe-inline': React renders
 * `style` attributes into the server HTML, which a nonce cannot cover, and style injection is far
 * less dangerous than script injection.
 */
export function buildCsp({
  nonce,
  dev = false,
  analytics = analyticsId() !== undefined,
}: {
  nonce?: string;
  dev?: boolean;
  /** Allow Google Analytics 4 to send its measurements. Defaults to "an ANALYTICS_GA4_ID is configured". */
  analytics?: boolean;
}): string {
  const script = ["'self'"];
  if (nonce) script.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  if (dev) script.push("'unsafe-eval'"); // React dev tooling only; never in production
  // Analytics (only when configured, and only loaded after the visitor accepts it): the tag itself
  // is trusted through the nonce + 'strict-dynamic' chain; these are the places it reports to.
  const ga = analytics ? ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' : '';
  const gaImg = analytics ? ' https://*.google-analytics.com https://*.googletagmanager.com' : '';
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${gaImg}`,
    "font-src 'self'",
    // Firebase Phone Auth: Identity Toolkit/Secure Token APIs and the reCAPTCHA widget (iframe + XHR).
    `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.gstatic.com${ga}`,
    "frame-src https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Private files (identity documents, tickets) opened as a document: nothing may load or run, and
 * the document gets an opaque origin (sandbox).
 */
export const PRIVATE_FILE_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

/** 128 random bits, base64: unguessable and unique per response. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
