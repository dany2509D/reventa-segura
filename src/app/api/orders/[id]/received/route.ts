import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { TransferDeadlineError, checkCanConfirmReceived, confirmReceived } from '@/lib/orders/delivery';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, fileField, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES, storePrivate, validateUpload } from '@/lib/uploads/uploads';

// One file plus multipart overhead.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
  if (e instanceof InvalidUploadError) return json({ error: uploadErrorMessage(e.reason) }, 400);
  if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado.' }, 403);
  if (e instanceof NotFoundError) return json({ error: 'Orden no encontrada.' }, 404);
  if (e instanceof TransferDeadlineError) {
    return json({ error: 'El plazo de transferencia ya venció. La orden será reembolsada.' }, 409);
  }
  if (e instanceof InvalidTransitionError) return json({ error: 'Esta orden ya no admite esta acción.' }, 409);
  // Never log the message: it may carry bound query parameters (phone numbers).
  console.error('received route error', e instanceof Error ? e.name : 'UnknownError');
  return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
}

// The buyer confirms the seller's transfer arrived (transferencia_pendiente → entrada_recibida),
// with multipart field `screenshot` (JPG/PNG/WebP) as proof. The stored path is never returned.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectUnsafeUpload(req);
  if (blocked) return blocked;
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);

    // Refuse before reading or storing the upload; confirmReceived re-checks under the row lock.
    await checkCanConfirmReceived(db, actor.userId, id);

    const form = await readMultipart(req, MAX_BODY_BYTES);
    const shot = form && (await fileField(form, 'screenshot'));
    if (!shot) return json({ error: 'Adjunta una captura de la entrada recibida.' }, 400);
    const { type, clean } = await validateUpload(shot.data, shot.type);
    if (type === 'pdf') return json({ error: 'La captura debe ser una imagen JPG, PNG o WebP.' }, 400);

    const store = getStore();
    const path = await storePrivate(store, clean, 'proof', actor.userId);
    try {
      await confirmReceived(db, actor.userId, id, path);
    } catch (e) {
      // Do not leave an orphaned screenshot behind.
      await store.del(path).catch(() => {});
      throw e;
    }
    return json({ ok: true, state: 'entrada_recibida' }, 200);
  } catch (e) {
    return errorResponse(e);
  }
}
