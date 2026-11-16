import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The QR scanner runs jsQR in a worker thread loaded from a plain file at runtime
  // (src/lib/tickets/fingerprint.ts → qr-worker.mjs). Static tracing cannot see that file
  // or its `jsqr` import, so ship both with the route that publishes listings.
  outputFileTracingIncludes: {
    '/api/listings': ['./src/lib/tickets/qr-worker.mjs', './node_modules/jsqr/**/*'],
  },
};

export default nextConfig;
