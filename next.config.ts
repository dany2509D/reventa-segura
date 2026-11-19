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

// Brand files in public/ are not fingerprinted (their URLs never change), so they cannot be cached
// "forever" like the hashed build assets: one day in browsers and a week of stale-while-revalidate,
// which is enough to make repeat visits free and still lets a new logo reach everyone within a day.
const publicAssetCache = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
const PUBLIC_ASSET_SOURCES = ['/icons/:path*', '/apple-touch-icon.png', '/favicon.svg', '/og-default.png'];

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
      // Cache policy for the unhashed files in public/ (the build assets already get immutable caching from Next).
      ...[...PUBLIC_ASSET_SOURCES, '/favicon.ico'].map((source) => ({ source, headers: publicAssetCache })),
      { source: '/api/files/:token', headers: privateFileHeaders },
      { source: '/api/orders/:id/ticket', headers: privateFileHeaders },
      { source: '/api/listings/:id/download', headers: privateFileHeaders },
    ];
  },
};

export default nextConfig;
