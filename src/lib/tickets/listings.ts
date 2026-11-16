import { and, asc, count, eq, gt, inArray, notInArray } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { assertAdmin } from '@/lib/authz';
import { appConfig, events, listings, orders, users } from '@/lib/db/schema';
import type { Actor, Db, Tx } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { IdentityRequiredError } from '@/lib/identity/errors';
import { assertCanSell } from '@/lib/identity/identity';
import { DEFAULT_PRICE_CAP_BPS, isPriceAllowed } from '@/lib/pricing/pricing';
import { InvalidUploadError } from '@/lib/uploads/errors';
import type { BlobStore } from '@/lib/uploads/store';
import { MIME_TYPES, detectType, storePrivate, validateUpload } from '@/lib/uploads/uploads';
import { isUuid } from '@/lib/uuid';
import {
  AmbiguousTicketError,
  DuplicateTicketError,
  EventClosedError,
  ListingBusyError,
  ListingLimitError,
  ListingStateError,
  PriceCapError,
  ResaleProhibitedError,
  TransferNotAllowedError,
} from './errors';
import { extractQrPayload, fingerprintTicket, qrFingerprint } from './fingerprint';

export type Listing = typeof listings.$inferSelect;
export type DeliveryMode = Listing['deliveryMode'];
export type ReviewDecision = 'verified' | 'rejected';

/** The only listing fields ever shown publicly: no seller, paths or fingerprint. */
export type PublicListing = { id: string; askCents: number; deliveryMode: DeliveryMode; eventId: string };

export type NewListingInput = {
  sellerId: string;
  eventId: string;
  askCents: number;
  deliveryMode: DeliveryMode;
  /** Screenshot of the ticket in the seller's ticketing account (image). */
  proof: Buffer;
  /** The ticket itself, required for 'file' delivery (image only: delivery watermarks it). */
  file?: Buffer;
  /** Client-declared MIME types (multipart). Default to the type detected from the bytes. */
  proofType?: string;
  fileType?: string;
  now?: Date;
};

export const DEFAULT_MAX_ACTIVE_LISTINGS = 10;
export const MAX_REVIEW_REASON = 500;
const INT32_MAX = 2_147_483_647;

// A fingerprint is taken while a listing is in one of these (the partial unique index).
const FINGERPRINT_STATUSES = ['pending', 'verified', 'sold'] as const;
// Statuses counted towards the per-seller limit (SEG-08).
const ACTIVE_STATUSES = ['pending', 'verified'] as const;
const FINGERPRINT_INDEX = 'listings_active_fingerprint_uq';

type Event = typeof events.$inferSelect;

function isImage(buf: Buffer): boolean {
  const t = detectType(buf);
  return t === 'jpeg' || t === 'png' || t === 'webp';
}

/** Positive integer from app_config, or `fallback` when missing, zero or malformed. */
async function configInt(db: Db, key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key));
  const v = row?.value.trim();
  return v && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : fallback;
}

/** Any of `fingerprints` held by a pending, verified or sold listing? */
async function fingerprintTaken(db: Db, fingerprints: string[]): Promise<boolean> {
  const [row] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(inArray(listings.fingerprint, fingerprints), inArray(listings.status, [...FINGERPRINT_STATUSES])))
    .limit(1);
  return Boolean(row);
}

function assertEventOpen(event: Event | undefined, now: Date): asserts event is Event {
  if (!event) throw new NotFoundError('Event not found');
  if (event.status !== 'active' || event.startsAt.getTime() <= now.getTime()) throw new EventClosedError();
  if (event.resaleProhibited) throw new ResaleProhibitedError();
}

async function activeListingCount(db: Db, sellerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), inArray(listings.status, [...ACTIVE_STATUSES])));
  return row.n;
}

/**
 * Publishes a ticket for resale as a 'pending' listing (RF-07, RF-08). Cheap checks run
 * first; files are stored only after every validation passed, and removed again if the
 * insert fails. The partial unique index on the fingerprint is the final word on duplicates
 * (two concurrent creates of the same ticket: exactly one wins).
 */
export async function createListing(db: Db, store: BlobStore, input: NewListingInput): Promise<Listing> {
  const { sellerId, eventId, askCents, deliveryMode, proof, file } = input;
  const now = input.now ?? new Date();

  if (!isUuid(sellerId)) throw new ValidationError('Invalid seller id', [{ path: 'sellerId', message: 'not a uuid' }]);
  await assertCanSell(db, sellerId);

  if (!isUuid(eventId)) throw new NotFoundError('Event not found');
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  assertEventOpen(event, now);

  if (deliveryMode === 'transfer') {
    if (!event.allowsTransfer) throw new TransferNotAllowedError();
    if (file) throw new ValidationError('Unexpected ticket file', [{ path: 'file', message: 'transfer mode takes no file' }]);
  } else if (deliveryMode === 'file') {
    if (!file) throw new ValidationError('Ticket file required', [{ path: 'file', message: 'required in file mode' }]);
    // Delivery watermarks the ticket, which only works on images: no PDFs.
    if (!isImage(file)) throw new InvalidUploadError('unsupported_type');
  } else {
    throw new ValidationError('Invalid delivery mode', [{ path: 'deliveryMode', message: 'transfer | file' }]);
  }
  if (!isImage(proof)) throw new InvalidUploadError('unsupported_type');

  if (!Number.isSafeInteger(askCents) || askCents <= 0 || askCents > INT32_MAX) {
    throw new ValidationError('Invalid amount', [{ path: 'askCents', message: 'positive integer cents' }]);
  }
  const capBps = await configInt(db, 'priceCapBps', DEFAULT_PRICE_CAP_BPS);
  if (!isPriceAllowed(askCents, event.faceValueCents, capBps)) {
    throw new PriceCapError(Math.floor((event.faceValueCents * capBps) / 10000));
  }

  const limit = await configInt(db, 'maxActiveListingsPerSeller', DEFAULT_MAX_ACTIVE_LISTINGS);
  if ((await activeListingCount(db, sellerId)) >= limit) throw new ListingLimitError(limit);

  const declared = (buf: Buffer, type?: string) => type ?? MIME_TYPES[detectType(buf)!];
  const cleanProof = await validateUpload(proof, declared(proof, input.proofType));
  const cleanFile = file ? await validateUpload(file, declared(file, input.fileType)) : undefined;

  // Fingerprinted from the original bytes: the ticket file when there is one, else the proof.
  // That value is stored (and guarded by the unique index).
  const ticket = await fingerprintTicket(file ?? proof);
  const fingerprint = ticket.fingerprint;
  // File mode: a readable QR in the proof must be free as well, so a decoy or degraded QR in
  // the file cannot re-list a ticket. A proof without a QR adds nothing (its img: hash is
  // not used for blocking).
  const proofQr = file ? await extractQrPayload(proof) : null;
  const blocking = [fingerprint];
  if (proofQr && qrFingerprint(proofQr) !== fingerprint) blocking.push(qrFingerprint(proofQr));
  if (await fingerprintTaken(db, blocking)) throw new DuplicateTicketError();
  // Both readable but different: the file is not the ticket shown in the seller's account.
  if (proofQr && ticket.qrPayload && proofQr !== ticket.qrPayload) throw new AmbiguousTicketError();

  const stored: string[] = [];
  try {
    const proofPath = await storePrivate(store, cleanProof.clean, 'proof', sellerId);
    stored.push(proofPath);
    let filePath: string | null = null;
    if (cleanFile) {
      filePath = await storePrivate(store, cleanFile.clean, 'ticket', sellerId);
      stored.push(filePath);
    }

    return await db.transaction(async (tx) => {
      // Locking the seller row serialises this seller's creates, so the limit holds under
      // concurrency; identity and event are re-checked as they may have changed meanwhile.
      const [seller] = await tx
        .select({ status: users.identityStatus })
        .from(users)
        .where(eq(users.id, sellerId))
        .for('update');
      if (seller?.status !== 'approved') throw new IdentityRequiredError();
      const [current] = await tx.select().from(events).where(eq(events.id, eventId)).for('share');
      assertEventOpen(current, now);
      if ((await activeListingCount(tx, sellerId)) >= limit) throw new ListingLimitError(limit);
      // The stored fingerprint is guarded by the unique index; the proof's QR (not stored)
      // is re-checked here to narrow the race window.
      if (blocking.length > 1 && (await fingerprintTaken(tx, blocking))) throw new DuplicateTicketError();

      const [row] = await tx
        .insert(listings)
        .values({ sellerId, eventId, askCents, deliveryMode, status: 'pending', fingerprint, proofPath, filePath })
        .returning();
      await audit(tx, {
        actorId: sellerId,
        action: 'listing.create',
        entity: 'listing',
        entityId: row.id,
        detail: {
          eventId,
          askCents,
          deliveryMode,
          method: fingerprint.startsWith('qr:') ? 'qr' : 'img',
          // Surfaced for the admin review: the QR scan ran out of time, so img: was used.
          ...(ticket.qrScanTimedOut ? { qrScanTimedOut: true } : {}),
        },
      });
      return row;
    });
  } catch (e) {
    // Never leave private ticket files behind for a listing that does not exist.
    await Promise.allSettled(stored.map((p) => store.del(p)));
    if (isUniqueViolation(e, FINGERPRINT_INDEX)) throw new DuplicateTicketError();
    throw e;
  }
}

/** Admin (with 2FA) decision on a pending listing: 'pending' → 'verified' | 'rejected' (RF-09). */
export async function reviewListing(
  db: Db,
  actor: Actor,
  listingId: string,
  decision: ReviewDecision,
  reason?: string,
): Promise<void> {
  assertAdmin(actor);
  if (decision !== 'verified' && decision !== 'rejected') throw new ValidationError('Invalid decision');
  const note = reason?.trim() || undefined;
  if (note && note.length > MAX_REVIEW_REASON) {
    throw new ValidationError('Reason too long', [{ path: 'reason', message: `max ${MAX_REVIEW_REASON}` }]);
  }
  if (!isUuid(listingId)) throw new NotFoundError('Listing not found');

  await db.transaction(async (tx) => {
    const listing = await lockListing(tx, listingId);
    if (!listing) throw new NotFoundError('Listing not found');
    // Separation of duties: an admin never decides on their own listing.
    if (listing.sellerId === actor.userId) throw new ForbiddenError();
    if (listing.status !== 'pending') throw new ListingStateError();
    await tx.update(listings).set({ status: decision }).where(eq(listings.id, listing.id));
    await audit(tx, {
      actorId: actor.userId,
      action: 'listing.review',
      entity: 'listing',
      entityId: listing.id,
      detail: { decision, from: 'pending', ...(note ? { reason: note } : {}) },
    });
  });
}

/**
 * The seller takes a pending or verified listing down (RF-10), freeing its fingerprint.
 * Not once sold, and not while an order on it is live.
 */
export async function withdrawListing(db: Db, sellerId: string, listingId: string): Promise<void> {
  if (!isUuid(listingId)) throw new NotFoundError('Listing not found');
  await db.transaction(async (tx) => {
    // Checkout locks the listing row before creating an order, so holding the lock here
    // means no new order can appear until this transaction ends.
    const listing = await lockListing(tx, listingId);
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenError();
    if (listing.status !== 'pending' && listing.status !== 'verified') throw new ListingStateError();
    const [live] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.listingId, listing.id), notInArray(orders.state, ['cancelada', 'reembolsada'])))
      .limit(1);
    if (live) throw new ListingBusyError();
    await tx.update(listings).set({ status: 'withdrawn' }).where(eq(listings.id, listing.id));
    await audit(tx, {
      actorId: sellerId,
      action: 'listing.withdraw',
      entity: 'listing',
      entityId: listing.id,
      detail: { from: listing.status },
    });
  });
}

/** Public catalogue of an event: verified listings of an active, future event, cheapest first. */
export async function listVerifiedListings(
  db: Db,
  eventId: string,
  now: Date = new Date(),
): Promise<PublicListing[]> {
  if (!isUuid(eventId)) return [];
  return db
    .select({
      id: listings.id,
      askCents: listings.askCents,
      deliveryMode: listings.deliveryMode,
      eventId: listings.eventId,
    })
    .from(listings)
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(
      and(
        eq(listings.eventId, eventId),
        eq(listings.status, 'verified'),
        eq(events.status, 'active'),
        gt(events.startsAt, now),
      ),
    )
    .orderBy(asc(listings.askCents), asc(listings.createdAt), asc(listings.id));
}

async function lockListing(tx: Tx, id: string): Promise<Listing | undefined> {
  const [l] = await tx.select().from(listings).where(eq(listings.id, id)).for('update');
  return l;
}

/** Postgres unique_violation (23505) on `constraint`; drivers nest it in `cause`. */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  for (let c: unknown = e, depth = 0; c && depth < 5; c = (c as { cause?: unknown }).cause, depth++) {
    const err = c as { code?: unknown; constraint?: unknown };
    if (err.code === '23505' && err.constraint === constraint) return true;
  }
  return false;
}
