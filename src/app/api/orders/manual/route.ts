import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectUnsafeRequest } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { errorName, log } from '@/lib/observability/log';
import {
  ListingUnavailableError,
  MANUAL_METHODS,
  PendingOrdersLimitError,
  SelfPurchaseError,
  startManualCheckout,
} from '@/lib/orders/service';
import { LIMITS, limitOr429 } from '@/lib/security/limits';

const body = z.object({ listingId: z.uuid(), paymentMethod: z.enum(MANUAL_METHODS) });

const json = (b: object, status: number) => NextResponse.json(b, { status, headers: { 'cache-control': 'no-store' } });

// Buyer starts a manual (Yappy / ACH) checkout: the listing is reserved for 15 minutes while the
// buyer transfers and uploads the receipt. Returns the reference to put in the transfer note.
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para comprar' }, 401);
    // Each checkout holds a listing: the budget also limits how much stock one buyer can lock.
    const limited = await limitOr429(db, LIMITS.checkout, actor.userId);
    if (limited) return limited;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Solicitud inválida' }, 400);

    const r = await startManualCheckout(db, actor.userId, parsed.data.listingId, parsed.data.paymentMethod);
    return json(
      { orderId: r.orderId, ref: r.ref, amount: r.amount, transferDeadline: r.transferDeadline.toISOString() },
      200,
    );
  } catch (e) {
    if (e instanceof ListingUnavailableError) return json({ error: 'Esta entrada ya no está disponible' }, 409);
    if (e instanceof PendingOrdersLimitError) return json({ error: e.message }, 429);
    if (e instanceof SelfPurchaseError) return json({ error: 'No puedes comprar tu propia entrada' }, 422);
    // Never log the message: it may carry bound query parameters.
    log('error', 'manual checkout route error', { error: errorName(e) });
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
