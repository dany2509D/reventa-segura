import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { runMaintenance } from '@/lib/jobs/maintenance';
import { alert, errorName, log } from '@/lib/observability/log';
import { getPaymentGateway } from '@/lib/payments';
import { queuePayoutOnRelease } from '@/lib/payouts/payouts';
import { purgeRateLimitHits } from '@/lib/security/rate-limit';
import { getStore } from '@/lib/uploads/store';

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

// Hashing first gives equal-length buffers, so the comparison time does not depend on the input.
function hasBearer(req: Request, secret: string): boolean {
  return timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}

// Vercel Cron (once a day on the Hobby plan, see vercel.ts) calls this with `Authorization: Bearer $CRON_SECRET`.
// Bearer-authenticated, so no Origin guard (the caller is not a browser). Responds with counts only.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      alert('cron_secret_missing');
      return json({ error: 'Cron no configurado' }, 500);
    }
    return json({ error: 'No autorizado' }, 401);
  }
  if (!hasBearer(req, secret)) return json({ error: 'No autorizado' }, 401);

  try {
    const db = getDb();
    const now = new Date();
    const result = await runMaintenance(
      db,
      {
        // No gateway in production (manual Yappy / ACH only): getPaymentGateway() would throw there
        // and take the whole run down, including the expiry of abandoned manual checkouts.
        gw: process.env.NODE_ENV === 'production' ? undefined : getPaymentGateway(),
        // Queues the seller's manual payout inside the releasing transaction (Task 10).
        onReleased: queuePayoutOnRelease,
        // The store is resolved only when an identity document is actually purged, so a storage
        // misconfiguration cannot block refunds, releases or abandoned-checkout expiry.
        deleteBlob: (path) => getStore().del(path),
      },
      now,
    );
    // Housekeeping only: a failure here must not hide the money results above.
    await purgeRateLimitHits(db, now).catch((e) => log('error', 'rate limit purge failed', { error: errorName(e) }));
    return json(result, 200);
  } catch (e) {
    // Never log the message: it may carry ids or bound query parameters.
    alert('maintenance_run_failed', { error: errorName(e) });
    return json({ error: 'Error interno' }, 500);
  }
}
