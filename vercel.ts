import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  // Expires unpaid checkouts and late transfers, releases orders after the 12 h window and purges
  // old identity documents. Vercel sends `Authorization: Bearer $CRON_SECRET` (set CRON_SECRET).
  crons: [{ path: '/api/cron/maintenance', schedule: '0 0 * * *' }],
};
