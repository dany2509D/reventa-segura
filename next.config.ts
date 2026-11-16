import type { NextConfig } from 'next';

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
};

export default nextConfig;
