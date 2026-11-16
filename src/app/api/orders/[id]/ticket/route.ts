import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { errorName, log } from '@/lib/observability/log';
import { UnsupportedDeliveryError, getDeliveredFile } from '@/lib/orders/delivery';
import { PRIVATE_FILE_CSP } from '@/lib/security/headers';
import { getStore } from '@/lib/uploads/store';

// Same values as next.config.ts declares for this path (which wins under Next).
const PRIVATE = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': PRIVATE_FILE_CSP,
};

const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: PRIVATE });

// File-mode ticket for its buyer, always watermarked with the buyer's masked phone and the
// order id. The seller's raw file is never served from here.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json('Inicia sesión para continuar.', 401);

    const { bytes, contentType } = await getDeliveredFile(db, getStore(), actor.userId, id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...PRIVATE,
        'content-type': contentType,
        'content-disposition': 'inline; filename="entrada.jpg"',
        'referrer-policy': 'no-referrer',
        'cross-origin-resource-policy': 'same-origin',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return json('Acceso denegado.', 403);
    if (e instanceof NotFoundError) return json('Entrada no disponible.', 404);
    if (e instanceof UnsupportedDeliveryError) {
      return json('No podemos mostrar esta entrada. Contacta a soporte.', 409);
    }
    // Never log the message: it may carry bound query parameters (phone numbers).
    log('error', 'ticket route error', { error: errorName(e) });
    return json('Error interno. Intenta de nuevo.', 500);
  }
}
