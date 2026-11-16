import { NextResponse } from 'next/server';
import { rejectUnsafeUpload } from '@/lib/auth/http';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { IdentityRequiredError } from '@/lib/identity/errors';
import { assertCanSell } from '@/lib/identity/identity';
import {
  DuplicateTicketError,
  EventClosedError,
  ListingLimitError,
  PriceCapError,
  ResaleProhibitedError,
  TransferNotAllowedError,
} from '@/lib/tickets/errors';
import { createListing } from '@/lib/tickets/listings';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { BodyTooLargeError, fileField, readMultipart, uploadErrorMessage } from '@/lib/uploads/http';
import { getStore } from '@/lib/uploads/store';
import { MAX_UPLOAD_BYTES } from '@/lib/uploads/uploads';

// Proof + optional ticket file plus multipart overhead.
const MAX_BODY_BYTES = 2 * MAX_UPLOAD_BYTES + 64 * 1024;

const json = (body: object, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const IDENTITY_REQUIRED = 'Verifica tu identidad antes de publicar entradas.';
const INVALID = 'Revisa los datos de la publicación.';
const IMAGES_ONLY = 'Formato no permitido. Usa una imagen JPG, PNG o WebP.';

const formatCents = (cents: number) => `B/. ${(cents / 100).toFixed(2)}`;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof BodyTooLargeError) return json({ error: uploadErrorMessage('too_large') }, 413);
  if (e instanceof InvalidUploadError) {
    // Listings take images only (proof and ticket), unlike identity documents.
    const msg = e.reason === 'unsupported_type' || e.reason === 'type_mismatch' ? IMAGES_ONLY : uploadErrorMessage(e.reason);
    return json({ error: msg }, 400);
  }
  if (e instanceof ValidationError) {
    if (e.issues[0]?.path === 'file') {
      return json({ error: 'Para la entrega por archivo adjunta la entrada como imagen; por transferencia no se adjunta.' }, 400);
    }
    return json({ error: INVALID }, 400);
  }
  if (e instanceof IdentityRequiredError) return json({ error: IDENTITY_REQUIRED }, 403);
  if (e instanceof NotFoundError) return json({ error: 'Evento no encontrado.' }, 404);
  if (e instanceof DuplicateTicketError) return json({ error: 'Esta entrada ya está publicada.' }, 409);
  if (e instanceof EventClosedError) return json({ error: 'Este evento ya no admite publicaciones.' }, 422);
  if (e instanceof ResaleProhibitedError) {
    return json({ error: 'El organizador prohíbe la reventa de entradas para este evento.' }, 422);
  }
  if (e instanceof TransferNotAllowedError) {
    return json({ error: 'Este evento no permite transferir entradas. Elige la entrega por archivo.' }, 422);
  }
  if (e instanceof PriceCapError) {
    return json({ error: `El precio supera el máximo permitido (${formatCents(e.maxCents)}).` }, 422);
  }
  if (e instanceof ListingLimitError) {
    return json({ error: `Alcanzaste el máximo de ${e.limit} publicaciones activas.` }, 422);
  }
  // Never log the message: it may carry bound query parameters.
  console.error('listings route error', e instanceof Error ? e.name : 'UnknownError');
  return json({ error: 'Error interno. Intenta de nuevo.' }, 500);
}

// Seller publishes a ticket (RF-07): multipart with `eventId`, `askCents` (integer cents),
// `deliveryMode` ('transfer' | 'file'), `proof` (image) and, for file delivery, `file`
// (the ticket image). Returns only the new listing id and its status.
export async function POST(req: Request) {
  const blocked = rejectUnsafeUpload(req);
  if (blocked) return blocked;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return json({ error: 'Inicia sesión para continuar.' }, 401);
    // Refuse unverified sellers before reading (and buffering) any upload.
    await assertCanSell(db, actor.userId);

    const form = await readMultipart(req, MAX_BODY_BYTES);
    if (!form) return json({ error: INVALID }, 400);
    const eventId = form.get('eventId');
    const askCents = form.get('askCents');
    const deliveryMode = form.get('deliveryMode');
    const proof = await fileField(form, 'proof');
    const file = await fileField(form, 'file');
    if (
      typeof eventId !== 'string' ||
      typeof askCents !== 'string' ||
      !/^\d{1,10}$/.test(askCents) ||
      (deliveryMode !== 'transfer' && deliveryMode !== 'file')
    ) {
      return json({ error: INVALID }, 400);
    }
    if (!proof) return json({ error: 'Adjunta la captura de la entrada en tu cuenta de la boletera.' }, 400);

    // An empty file input still sends an empty part: treat it as no file.
    const ticket = file && file.data.length > 0 ? file : undefined;
    const listing = await createListing(db, getStore(), {
      sellerId: actor.userId,
      eventId,
      askCents: Number(askCents),
      deliveryMode,
      proof: proof.data,
      proofType: proof.type,
      file: ticket?.data,
      fileType: ticket?.type,
    });
    return json({ id: listing.id, status: listing.status }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
