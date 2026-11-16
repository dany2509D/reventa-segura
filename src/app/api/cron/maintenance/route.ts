import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { runMaintenance } from '@/lib/jobs/maintenance';
import { getPaymentGateway } from '@/lib/payments';
import { queuePayoutOnRelease } from '@/lib/payouts/payouts';
import { getStore } from '@/lib/uploads/store';

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

// Hashing first gives equal-length buffers, so the comparison time does not depend on the input.
function hasBearer(req: Request, secret: string): boolean {
  return timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}

// Vercel Cron (every 10 min, see vercel.ts) calls this with `Authorization: Bearer $CRON_SECRET`.
// Responds with counts only.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('cron maintenance: CRON_SECRET is not configured');
      return json({ error: 'Cron no configurado' }, 500);
    }
    return json({ error: 'No autorizado' }, 401);
  }
  if (!hasBearer(req, secret)) return json({ error: 'No autorizado' }, 401);

  try {
    const result = await runMaintenance(
      getDb(),
      {
        gw: getPaymentGateway(),
        // Queues the seller's manual payout inside the releasing transaction (Task 10).
        onReleased: queuePayoutOnRelease,
        // The store is resolved only when an identity document is actually purged, so a storage
        // misconfiguration cannot block refunds, releases or abandoned-checkout expiry.
        deleteBlob: (path) => getStore().del(path),
      },
      new Date(),
    );
    return json(result, 200);
  } catch (e) {
    // Never log the message: it may carry ids or bound query parameters.
    console.error('cron maintenance error', e instanceof Error ? e.name : 'UnknownError');
    return json({ error: 'Error interno' }, 500);
  }
}
