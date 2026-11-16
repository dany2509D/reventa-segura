import { and, asc, count, desc, eq, gt, min, sql } from 'drizzle-orm';
import { disputes, events, listings, orders, payouts, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { isUuid } from '@/lib/uuid';

/*
 * Read models for the member-facing pages. Everything scoped to a person takes that person's id
 * from the session on the server; none of these accept an id from the client for someone else.
 */

export async function upcomingEvents(db: Db, now: Date = new Date()) {
  return db
    .select({
      id: events.id,
      name: events.name,
      venue: events.venue,
      startsAt: events.startsAt,
      resaleProhibited: events.resaleProhibited,
      allowsTransfer: events.allowsTransfer,
      faceValueCents: events.faceValueCents,
      fromCents: min(listings.askCents),
      listingCount: count(listings.id),
    })
    .from(events)
    .leftJoin(listings, and(eq(listings.eventId, events.id), eq(listings.status, 'verified')))
    .where(and(eq(events.status, 'active'), gt(events.startsAt, now)))
    .groupBy(events.id)
    .orderBy(asc(events.startsAt));
}

export async function eventDetail(db: Db, eventId: string) {
  if (!isUuid(eventId)) return null;
  const [row] = await db
    .select({
      id: events.id,
      name: events.name,
      venue: events.venue,
      startsAt: events.startsAt,
      faceValueCents: events.faceValueCents,
      allowsTransfer: events.allowsTransfer,
      resaleProhibited: events.resaleProhibited,
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, eventId));
  return row ?? null;
}

export async function buyerOrders(db: Db, buyerId: string) {
  return db
    .select({
      orderId: orders.id,
      state: orders.state,
      priceCents: orders.priceCents,
      createdAt: orders.createdAt,
      transferDeadline: orders.transferDeadline,
      deliveryMode: listings.deliveryMode,
      eventId: events.id,
      eventName: events.name,
      startsAt: events.startsAt,
      lat: events.lat,
      lng: events.lng,
      hasOpenDispute: sql<boolean>`exists (select 1 from ${disputes} where ${disputes.orderId} = ${orders.id} and ${disputes.status} = 'open')`,
    })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(orders.createdAt));
}

export async function sellerListings(db: Db, sellerId: string) {
  return db
    .select({
      listingId: listings.id,
      status: listings.status,
      askCents: listings.askCents,
      deliveryMode: listings.deliveryMode,
      eventName: events.name,
      startsAt: events.startsAt,
    })
    .from(listings)
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(eq(listings.sellerId, sellerId))
    .orderBy(desc(listings.createdAt));
}

export async function sellerSales(db: Db, sellerId: string) {
  return db
    .select({
      orderId: orders.id,
      state: orders.state,
      netCents: sql<number>`${orders.priceCents} - ${orders.feeCents}`.mapWith(Number),
      payoutStatus: payouts.status,
      eventName: events.name,
      deliveryMode: listings.deliveryMode,
      transferDeadline: orders.transferDeadline,
    })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .leftJoin(payouts, eq(payouts.orderId, orders.id))
    .where(eq(listings.sellerId, sellerId))
    .orderBy(desc(orders.createdAt));
}

export async function profileOf(db: Db, userId: string) {
  if (!isUuid(userId)) return null;
  const [row] = await db
    .select({ userId: users.id, phone: users.phone, identityStatus: users.identityStatus })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/** A listing a visitor can buy right now (verified, active future event), for the purchase page. */
export async function listingOffer(db: Db, listingId: string, now: Date = new Date()) {
  if (!isUuid(listingId)) return null;
  const [row] = await db
    .select({
      listingId: listings.id,
      askCents: listings.askCents,
      deliveryMode: listings.deliveryMode,
      sellerId: listings.sellerId,
      eventId: events.id,
      eventName: events.name,
      venue: events.venue,
      startsAt: events.startsAt,
      resaleProhibited: events.resaleProhibited,
      allowsTransfer: events.allowsTransfer,
    })
    .from(listings)
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(and(eq(listings.id, listingId), eq(listings.status, 'verified'), eq(events.status, 'active'), gt(events.startsAt, now)));
  return row ?? null;
}
