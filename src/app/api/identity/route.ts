import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { IdentityStateError } from '@/lib/identity/errors';
import { submitIdentity } from '@/lib/identity/identity';
import { errorName, log } from '@/lib/observability/log';
import { LIMITS, limitOr429 } from '@/lib/security/limits';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, fileField, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES, storePrivate, validateUpload } from '@/lib/uploads/uploads';

// Two files plus multipart overhead.
const MAX_BODY_BYTES = 2 * MAX_UPLOAD_BYTES + 64 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const ALREADY_SUBMITTED = 'Tu verificación ya está en revisión o aprobada.';

// Seller identity upload (RF-02): multipart with `doc` (cédula/pasaporte: image
// or PDF), `selfie` (image) and `consent=yes` (the person authorised the processing). Stores only private paths; never returns them.
export async function POST(req: Request) {
  const blocked = rejectUnsafeUpload(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);
    const limited = await limitOr429(db, LIMITS.identity, actor.userId);
    if (limited) return limited;

    const [current] = await db
      .select({ status: users.identityStatus })
      .from(users)
      .where(eq(users.id, actor.userId));
    if (current?.status !== 'none' && current?.status !== 'rejected') {
      return json({ error: ALREADY_SUBMITTED }, 409);
    }

    const form = await readMultipart(req, MAX_BODY_BYTES);
    const doc = form && (await fileField(form, 'doc'));
    const selfie = form && (await fileField(form, 'selfie'));
    if (!doc || !selfie) {
      return json({ error: 'Adjunta tu documento de identidad y una selfie.' }, 400);
    }

    // Explicit consent to process identity data (Ley 81 de 2019): the form sends `consent=yes` only
    // after the person ticks the box, so a request without it is not a submission we may keep.
    if (form?.get('consent') !== 'yes') {
      return json({ error: 'Debes autorizar el tratamiento de tu documento y tu selfie para continuar.' }, 400);
    }

    const docFile = await validateUpload(doc.data, doc.type);
    const selfieFile = await validateUpload(selfie.data, selfie.type);
    if (selfieFile.type === 'pdf') {
      return json({ error: 'La selfie debe ser una foto JPG, PNG o WebP.' }, 400);
    }

    const store = getStore();
    const stored: string[] = [];
    try {
      const docPath = await storePrivate(store, docFile.clean, 'identity', actor.userId);
      stored.push(docPath);
      const selfiePath = await storePrivate(store, selfieFile.clean, 'selfie', actor.userId);
      stored.push(selfiePath);
      await submitIdentity(db, actor.userId, docPath, selfiePath);
    } catch (e) {
      // Do not leave orphaned identity documents behind.
      await Promise.allSettled(stored.map((p) => store.del(p)));
      throw e;
    }
    return json({ ok: true, identityStatus: 'pending' }, 200);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
    if (e instanceof InvalidUploadError) return json({ error: uploadErrorMessage(e.reason) }, 400);
    if (e instanceof IdentityStateError) return json({ error: ALREADY_SUBMITTED }, 409);
    // Never log the message: it may carry bound query parameters.
    log('error', 'identity route error', { error: errorName(e) });
    return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
  }
}
