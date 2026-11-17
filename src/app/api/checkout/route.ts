import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectUnsafeRequest } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { errorName, log } from '@/lib/observability/log';
import { ListingUnavailableError, PendingOrdersLimitError, SelfPurchaseError, startCheckout } from '@/lib/orders/service';
import { getPaymentGateway } from '@/lib/payments';
import { LIMITS, limitOr429 } from '@/lib/security/limits';

const body = z.object({ listingId: z.uuid() });

const json = (b: object, status: number) => NextResponse.json(b, { status, headers: { 'cache-control': 'no-store' } });

// Buyer starts a checkout: holds the listing for 15 minutes and returns the gateway URL.
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

    const result = await startCheckout(db, getPaymentGateway(), actor.userId, parsed.data.listingId);
    return json(result, 200);
  } catch (e) {
    if (e instanceof ListingUnavailableError) return json({ error: 'Esta entrada ya no está disponible' }, 409);
    if (e instanceof PendingOrdersLimitError) return json({ error: e.message }, 429);
    if (e instanceof SelfPurchaseError) return json({ error: 'No puedes comprar tu propia entrada' }, 422);
    // Never log the message: it may carry bound query parameters.
    log('error', 'checkout route error', { error: errorName(e) });
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
