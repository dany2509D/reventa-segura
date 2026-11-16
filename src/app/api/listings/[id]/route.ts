import { NextResponse } from 'next/server';
import { rejectCrossOrigin } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { errorName, log } from '@/lib/observability/log';
import { LIMITS, limitOr429 } from '@/lib/security/limits';
import { ListingBusyError, ListingStateError } from '@/lib/tickets/errors';
import { withdrawListing } from '@/lib/tickets/listings';

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

// Seller withdraws their listing (RF-10). Body-less DELETE: the Origin header is the CSRF guard.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);
    const limited = await limitOr429(db, LIMITS.listingWithdraw, actor.userId);
    if (limited) return limited;
    await withdrawListing(db, actor.userId, id);
    return json({ ok: true, status: 'withdrawn' }, 200);
  } catch (e) {
    if (e instanceof NotFoundError) return json({ error: 'Publicación no encontrada.' }, 404);
    if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado.' }, 403);
    if (e instanceof ListingBusyError) {
      return json({ error: 'Hay una compra en curso sobre esta publicación; no se puede retirar.' }, 409);
    }
    if (e instanceof ListingStateError) return json({ error: 'Esta publicación ya no se puede retirar.' }, 409);
    log('error', 'listing withdraw route error', { error: errorName(e) });
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
