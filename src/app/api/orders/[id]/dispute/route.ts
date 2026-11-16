import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import {
  DisputeAlreadyOpenError,
  DisputeWindowClosedError,
  MAX_EVIDENCE_FILES,
  MAX_REASON_LENGTH,
  openDispute,
} from '@/lib/disputes/disputes';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isUuid } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES, storePrivate, validateUpload } from '@/lib/uploads/uploads';

// Up to five files plus multipart overhead.
const MAX_BODY_BYTES = MAX_EVIDENCE_FILES * MAX_UPLOAD_BYTES + 64 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const NOT_FOUND = 'No encontramos esta compra.';
const BAD_REASON = `Cuéntanos qué pasó (máximo ${MAX_REASON_LENGTH} caracteres).`;

// Buyer opens a dispute (RF-15): multipart with `reason` and up to five `evidence` files
// (JPEG/PNG/WebP/PDF). Files are stored privately; their paths are never returned.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rejectUnsafeUpload(req);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);

    // Cheap ownership check before reading, decoding or storing any upload.
    if (!isUuid(id)) return json({ error: NOT_FOUND }, 404);
    const [order] = await db.select({ buyerId: orders.buyerId }).from(orders).where(eq(orders.id, id));
    if (!order) return json({ error: NOT_FOUND }, 404);
    if (order.buyerId !== actor.userId) return json({ error: 'Acceso denegado' }, 403);

    const form = await readMultipart(req, MAX_BODY_BYTES);
    if (!form) return json({ error: 'Solicitud inválida.' }, 400);
    const reason = form.get('reason');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > MAX_REASON_LENGTH) {
      return json({ error: BAD_REASON }, 400);
    }
    const entries = form.getAll('evidence');
    if (entries.length > MAX_EVIDENCE_FILES) {
      return json({ error: `Puedes adjuntar hasta ${MAX_EVIDENCE_FILES} archivos.` }, 400);
    }
    if (entries.some((v) => !(v instanceof Blob))) return json({ error: 'Solicitud inválida.' }, 400);

    // Validate everything before storing anything.
    const files = [];
    for (const v of entries as Blob[]) {
      files.push(await validateUpload(Buffer.from(await v.arrayBuffer()), v.type));
    }

    const store = getStore();
    const stored: string[] = [];
    try {
      for (const f of files) stored.push(await storePrivate(store, f.clean, 'evidence', actor.userId));
      await openDispute(db, actor.userId, id, reason, stored);
    } catch (e) {
      await Promise.allSettled(stored.map((p) => store.del(p))); // no orphaned evidence
      throw e;
    }
    return json({ ok: true }, 200);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
    if (e instanceof InvalidUploadError) return json({ error: uploadErrorMessage(e.reason) }, 400);
    if (e instanceof ValidationError) return json({ error: 'Solicitud inválida.' }, 400);
    if (e instanceof NotFoundError) return json({ error: NOT_FOUND }, 404);
    if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado' }, 403);
    if (e instanceof DisputeAlreadyOpenError) {
      return json({ error: 'Ya tienes una disputa abierta para esta compra.' }, 409);
    }
    if (e instanceof DisputeWindowClosedError) {
      return json({ error: 'El plazo para abrir una disputa terminó 12 horas después del inicio del evento.' }, 409);
    }
    if (e instanceof InvalidTransitionError) return json({ error: 'Esta compra ya no admite disputas.' }, 409);
    // Never log the message: it may carry bound query parameters.
    console.error('dispute route error', e instanceof Error ? e.name : 'UnknownError');
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
