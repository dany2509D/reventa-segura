import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { disputes, events, listings, orders, payouts, users } from '@/lib/db/schema';
import { assertAdmin } from '@/lib/authz';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';

/*
 * Read models for the admin panel queues. Every read takes the caller and requires an admin who passed
 * 2FA: Next can render a page WITHOUT re-running its layout, so the layout check alone is not a gate.
 * rows carry phone numbers and private file paths, so never return them from a public route.
 */

function requireAdminActor(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw new ForbiddenError();
  assertAdmin(actor);
}

export type PendingIdentity = { userId: string; phone: string; idDocPath: string | null; selfiePath: string | null };

export async function pendingIdentities(db: Db, actor: Actor | null): Promise<PendingIdentity[]> {
  requireAdminActor(actor);
  return db
    .select({ userId: users.id, phone: users.phone, idDocPath: users.idDocPath, selfiePath: users.selfiePath })
    .from(users)
    .where(eq(users.identityStatus, 'pending'))
    .orderBy(asc(users.createdAt));
}

export async function openDisputes(db: Db, actor: Actor | null) {
  requireAdminActor(actor);
  const buyer = alias(users, 'buyer');
  return db
    .select({
      disputeId: disputes.id,
      orderId: disputes.orderId,
      reason: disputes.reason,
      evidencePaths: disputes.evidencePaths,
      openedAt: disputes.createdAt,
      priceCents: orders.priceCents,
      orderState: orders.state,
      eventName: events.name,
      buyerPhone: buyer.phone,
    })
    .from(disputes)
    .innerJoin(orders, eq(orders.id, disputes.orderId))
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .innerJoin(buyer, eq(buyer.id, disputes.openedBy))
    .where(eq(disputes.status, 'open'))
    .orderBy(asc(disputes.createdAt));
}

export async function queuedPayouts(db: Db, actor: Actor | null) {
  requireAdminActor(actor);
  return db
    .select({
      payoutId: payouts.id,
      orderId: payouts.orderId,
      amountCents: payouts.amountCents,
      sellerPhone: users.phone,
      orderState: orders.state,
      eventName: events.name,
    })
    .from(payouts)
    .innerJoin(orders, eq(orders.id, payouts.orderId))
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .innerJoin(users, eq(users.id, payouts.sellerId))
    .where(eq(payouts.status, 'queued'))
    .orderBy(asc(orders.createdAt));
}

export async function allEvents(db: Db, actor: Actor | null) {
  requireAdminActor(actor);
  return db
    .select({
      id: events.id,
      name: events.name,
      venue: events.venue,
      startsAt: events.startsAt,
      status: events.status,
      faceValueCents: events.faceValueCents,
      resaleProhibited: events.resaleProhibited,
      allowsTransfer: events.allowsTransfer,
    })
    .from(events)
    .orderBy(desc(events.startsAt));
}

export async function pendingListings(db: Db, actor: Actor | null) {
  requireAdminActor(actor);
  return db
    .select({
      listingId: listings.id,
      askCents: listings.askCents,
      faceValueCents: events.faceValueCents,
      deliveryMode: listings.deliveryMode,
      eventName: events.name,
      sellerPhone: users.phone,
      proofPath: listings.proofPath,
      filePath: listings.filePath,
    })
    .from(listings)
    .innerJoin(events, eq(events.id, listings.eventId))
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.status, 'pending'))
    .orderBy(asc(listings.createdAt));
}
