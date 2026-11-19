import type { NextConfig } from 'next';
import { PRIVATE_FILE_CSP, SECURITY_HEADERS, buildCsp } from './src/lib/security/headers';

// API routes and build assets skip the proxy (src/proxy.ts), so they get the same headers from
// here, with a nonce-less CSP (they never render Next's inline scripts). The two never overlap:
// the proxy matcher excludes exactly these paths.
const staticHeaders = Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
const assetHeaders = [{ key: 'Content-Security-Policy', value: buildCsp({}) }, ...staticHeaders];

// Headers configured here replace same-named headers a route handler sets (checked against
// `next start`), so a route that needs a stricter value is listed here. When several rules
// match, the last one wins per header: keep these after the general /api rule.
const privateFileHeaders = [
  { key: 'Content-Security-Policy', value: PRIVATE_FILE_CSP },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

const nextConfig: NextConfig = {
  // Development only: lets a phone on the same Wi-Fi (192.168.x.x) load the dev server's assets
  // for manual testing. Ignored by `next build` / `next start`.
  allowedDevOrigins: ['192.168.*.*'],

  // The QR scanner runs jsQR in a worker thread loaded from a plain file at runtime
  // (src/lib/tickets/fingerprint.ts → qr-worker.mjs). Static tracing cannot see that file
  // or its `jsqr` import, so ship both with the route that publishes listings.
  outputFileTracingIncludes: {
    '/api/listings': ['./src/lib/tickets/qr-worker.mjs', './node_modules/jsqr/**/*'],
  },
  poweredByHeader: false,
  images: {
    qualities: [75, 90],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      ...['/api/:path*', '/_next/static/:path*', '/_next/image', '/favicon.ico'].map((source) => ({
        source,
        headers: assetHeaders,
      })),
      { source: '/api/files/:token', headers: privateFileHeaders },
      { source: '/api/orders/:id/ticket', headers: privateFileHeaders },
      { source: '/api/listings/:id/download', headers: privateFileHeaders },
    ];
  },
};

export default nextConfig;
