import { and, eq, inArray } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { isAdmin } from '@/lib/authz';
import { listings, orders } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { DELIVERABLE_STATES, getDeliveredFile } from '@/lib/orders/delivery';
import type { BlobStore } from '@/lib/uploads/store';
import { MIME_TYPES, detectType, parseFilePath } from '@/lib/uploads/uploads';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListingFile = { bytes: Buffer; contentType: string; attachment: boolean };

/**
 * The ticket file of a listing, for exactly three kinds of caller:
 *  - the seller who owns the listing (their original file),
 *  - an admin whose session passed 2FA (original file; the read is audited, fail closed),
 *  - the buyer of a paid order on it (always the buyer-watermarked image, never the original).
 * Anyone else gets ForbiddenError; an unknown listing gets NotFoundError.
 */
export async function getListingFile(db: Db, store: BlobStore, actor: Actor, listingId: string): Promise<ListingFile> {
  if (!UUID_RE.test(listingId)) throw new NotFoundError();
  const [listing] = await db
    .select({ id: listings.id, sellerId: listings.sellerId, filePath: listings.filePath })
    .from(listings)
    .where(eq(listings.id, listingId));
  if (!listing) throw new NotFoundError();

  const isSeller = listing.sellerId === actor.userId;
  if (!isSeller && !isAdmin(actor)) {
    // Buyer path: a paid order of this listing that belongs to the caller.
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.listingId, listing.id),
          eq(orders.buyerId, actor.userId),
          inArray(orders.state, [...DELIVERABLE_STATES]),
        ),
      );
    if (!order) throw new ForbiddenError();
    const { bytes, contentType } = await getDeliveredFile(db, store, actor.userId, order.id);
    return { bytes, contentType, attachment: false };
  }

  // Only ever the seller's own `ticket` upload, never another kind of private file.
  const file = listing.filePath ? parseFilePath(listing.filePath) : null;
  if (!listing.filePath || !file || file.kind !== 'ticket' || file.ownerId !== listing.sellerId) {
    throw new NotFoundError('No ticket file for this listing');
  }
  const bytes = await store.get(listing.filePath);
  if (!bytes) throw new NotFoundError('No ticket file for this listing');

  if (!isSeller) {
    // Fail closed: if the audit row cannot be written, the file is not served.
    await db.transaction((tx) =>
      audit(tx, {
        actorId: actor.userId,
        action: 'listing.file_read',
        entity: 'listing',
        entityId: listing.id,
        detail: { sellerId: listing.sellerId },
      }),
    );
  }

  const type = detectType(bytes);
  return {
    bytes,
    contentType: type ? MIME_TYPES[type] : 'application/octet-stream',
    // PDFs are not sanitized, so they are downloaded rather than rendered inline.
    attachment: type === 'pdf' || !type,
  };
}
