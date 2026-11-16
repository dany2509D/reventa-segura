import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { ForbiddenError } from '@/lib/errors';
import { errorName, log } from '@/lib/observability/log';
import { isUuid } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { assertProofAllowed, ProofNotAllowedError, ProofWindowClosedError, submitPaymentProof } from '@/lib/orders/service';
import { LIMITS, limitOr429 } from '@/lib/security/limits';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, fileField, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES, storePrivate, validateUpload } from '@/lib/uploads/uploads';

const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const MAX_REFERENCE_LENGTH = 64;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const NOT_FOUND = 'No encontramos esta compra.';

// Buyer uploads the payment receipt of a manual (Yappy / ACH) order: multipart with a `proof` file
// (JPEG/PNG/WebP/PDF) and an optional `reference`. Stored privately; the key is never returned.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectUnsafeUpload(req);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);
    const limited = await limitOr429(db, LIMITS.orderProof, actor.userId);
    if (limited) return limited;

    // Cheap ownership/state/deadline check before reading, decoding or storing any upload.
    if (!isUuid(id)) return json({ error: NOT_FOUND }, 404);
    const [order] = await db
      .select({
        buyerId: orders.buyerId,
        state: orders.state,
        paymentMethod: orders.paymentMethod,
        transferDeadline: orders.transferDeadline,
      })
      .from(orders)
      .where(eq(orders.id, id));
    if (!order) return json({ error: NOT_FOUND }, 404);
    assertProofAllowed(order, actor.userId, new Date());

    const form = await readMultipart(req, MAX_BODY_BYTES);
    if (!form) return json({ error: 'Solicitud inválida.' }, 400);
    const file = await fileField(form, 'proof');
    if (!file) return json({ error: 'Adjunta la captura o PDF del comprobante.' }, 400);
    const rawRef = form.get('reference');
    if (rawRef !== null && typeof rawRef !== 'string') return json({ error: 'Solicitud inválida.' }, 400);
    const reference = rawRef?.trim() ? rawRef.trim() : null;
    if (reference && reference.length > MAX_REFERENCE_LENGTH) {
      return json({ error: `El número de confirmación admite hasta ${MAX_REFERENCE_LENGTH} caracteres.` }, 400);
    }

    const { clean } = await validateUpload(file.data, file.type);

    const store = getStore();
    // proof/<orderId>/<uuid>: same opaque scheme as tickets; admins read it via signed URLs.
    const key = await storePrivate(store, clean, 'proof', id);
    let replacedKey: string | null;
    try {
      ({ replacedKey } = await submitPaymentProof(db, actor.userId, id, { key, reference }));
    } catch (e) {
      await store.del(key).catch(() => {}); // no orphaned receipt
      throw e;
    }
    if (replacedKey) await store.del(replacedKey).catch(() => {});
    return json({ ok: true }, 200);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
    if (e instanceof InvalidUploadError) return json({ error: uploadErrorMessage(e.reason) }, 400);
    if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado' }, 403);
    if (e instanceof ProofWindowClosedError) {
      return json({ error: 'El plazo de 15 minutos terminó y la reserva se liberó. Empieza de nuevo.' }, 409);
    }
    if (e instanceof ProofNotAllowedError || e instanceof InvalidTransitionError) {
      return json({ error: 'Esta compra ya no admite comprobantes.' }, 409);
    }
    // Never log the message: it may carry bound query parameters.
    log('error', 'payment proof route error', { error: errorName(e) });
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
