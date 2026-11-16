import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { EntryWindowError, confirmEntry } from '@/lib/entry/confirmation';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isUuid } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, fileField, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES, storePrivate, validateUpload } from '@/lib/uploads/uploads';

// One photo plus multipart overhead.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const NOT_FOUND = 'No encontramos esta compra.';

// Missing or unparseable coordinates become NaN: geolocation is a signal, never a requirement.
function coordinate(form: FormData, name: string): number {
  const v = form.get(name);
  return typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
}

// Buyer confirms entry (RF-14): multipart with `photo` (scan of the ticket at the door) and
// optional `lat`/`lng`. The photo is stored privately; its path is never returned.
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
    const photo = form && (await fileField(form, 'photo'));
    if (!form || !photo) return json({ error: 'Adjunta la foto del escaneo de tu entrada.' }, 400);
    const file = await validateUpload(photo.data, photo.type);
    if (file.type === 'pdf') return json({ error: 'La foto debe ser JPG, PNG o WebP.' }, 400);

    const store = getStore();
    const photoPath = await storePrivate(store, file.clean, 'proof', actor.userId);
    try {
      const { geoOk } = await confirmEntry(db, actor.userId, id, {
        lat: coordinate(form, 'lat'),
        lng: coordinate(form, 'lng'),
        photoPath,
      });
      return json({ ok: true, geoOk }, 200);
    } catch (e) {
      await store.del(photoPath).catch(() => {}); // no orphaned photos
      throw e;
    }
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
    if (e instanceof InvalidUploadError) return json({ error: uploadErrorMessage(e.reason) }, 400);
    if (e instanceof ValidationError) return json({ error: 'Solicitud inválida.' }, 400);
    if (e instanceof NotFoundError) return json({ error: NOT_FOUND }, 404);
    if (e instanceof ForbiddenError) return json({ error: 'Acceso denegado' }, 403);
    if (e instanceof EntryWindowError) {
      return json(
        { error: 'Puedes confirmar tu ingreso desde 3 horas antes del evento hasta 12 horas después de su inicio.' },
        409,
      );
    }
    if (e instanceof InvalidTransitionError) {
      return json({ error: 'Esta compra no está esperando la confirmación de ingreso.' }, 409);
    }
    // Never log the message: it may carry bound query parameters.
    console.error('entry route error', e instanceof Error ? e.name : 'UnknownError');
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
