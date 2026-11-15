import { events, listings, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';

let seq = 0;
const phone = () => `+5076${String(++seq).padStart(7, '0')}`;

type ListingStatus = (typeof listings.$inferSelect)['status'];

/** Seller + buyer + active event + listing (verified by default). Test-only helper. */
export async function seedListing(
  db: Db,
  o: {
    askCents?: number;
    deliveryMode?: 'transfer' | 'file';
    status?: ListingStatus;
    startsAt?: Date;
    eventStatus?: 'active' | 'cancelled';
  } = {},
) {
  const [seller] = await db.insert(users).values({ phone: phone() }).returning();
  const [buyer] = await db.insert(users).values({ phone: phone() }).returning();
  const [event] = await db
    .insert(events)
    .values({
      name: 'Concierto',
      venue: 'Atlapa',
      lat: 9,
      lng: -79.5,
      radiusM: 500,
      startsAt: o.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      faceValueCents: 5000,
      status: o.eventStatus ?? 'active',
    })
    .returning();
  const [listing] = await db
    .insert(listings)
    .values({
      sellerId: seller.id,
      eventId: event.id,
      askCents: o.askCents ?? 5000,
      deliveryMode: o.deliveryMode ?? 'transfer',
      status: o.status ?? 'verified',
      fingerprint: `fp-${seq}-${Math.random()}`,
      proofPath: 'proofs/p.png',
    })
    .returning();
  return { seller, buyer, event, listing };
}

export async function newUser(db: Db) {
  const [u] = await db.insert(users).values({ phone: phone() }).returning();
  return u;
}
