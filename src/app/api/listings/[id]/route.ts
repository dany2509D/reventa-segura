import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { ListingBusyError, ListingStateError } from '@/lib/tickets/errors';
import { withdrawListing } from '@/lib/tickets/listings';

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

// CSRF guard for this cookie-authenticated, body-less DELETE: browsers send Origin on
// every non-GET fetch, so it is mandatory and must match the request host.
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin === null) return false;
  const host = req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Seller withdraws their listing (RF-10).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);
    await withdrawListing(db, actor.userId, id);
    return json({ ok: true, status: 'withdrawn' }, 200);
  } catch (e) {
    if (e instanceof NotFoundError) return json({ error: 'Publicación no encontrada.' }, 404);
    if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado.' }, 403);
    if (e instanceof ListingBusyError) {
      return json({ error: 'Hay una compra en curso sobre esta publicación; no se puede retirar.' }, 409);
    }
    if (e instanceof ListingStateError) return json({ error: 'Esta publicación ya no se puede retirar.' }, 409);
    console.error('listing withdraw route error', e instanceof Error ? e.name : 'UnknownError');
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
