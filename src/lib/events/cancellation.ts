import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { assertAdmin } from '@/lib/authz';
import { disputes, events, listings, orders } from '@/lib/db/schema';
import type { Actor, Db, Tx } from '@/lib/db/types';
import { NotFoundError } from '@/lib/errors';
import { applyTransition } from '@/lib/orders/service';
import { isUuid, lockOrderForUpdate, refundPaidOrder, type OrderRow } from '@/lib/orders/settlement';
import type { OrderState } from '@/lib/orders/state-machine';
import type { PaymentGateway } from '@/lib/payments/gateway';

export type CancelEventResult = {
  /** Paid orders refunded in full through the gateway (now `reembolsada`). */
  refunded: number;
  /** `liquidada` orders (seller already paid): no gateway refund, flagged needsManualReview. */
  manualReview: number;
  /** Unpaid `creada` checkouts cancelled. */
  abandoned: number;
  /** `pending`/`verified` listings withdrawn. */
  withdrawn: number;
  /** Orders whose processing threw; they are left untouched and retried by the next call. */
  failed: number;
};

/** Paid states whose money the platform still holds: refunded in full when the event is cancelled. */
const REFUNDABLE: readonly OrderState[] = [
  'transferencia_pendiente',
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
];

type Outcome = 'refunded' | 'manualReview' | 'abandoned' | 'skipped';

/**
 * An admin with 2FA cancels an event (RF-20):
 * 1. the event becomes `cancelled`, which blocks new checkouts (startCheckout checks it);
 * 2. its `pending`/`verified` listings are withdrawn (sold ones stay sold);
 * 3. every order of its listings is settled, each in its own transaction under the order lock with
 *    the state re-checked after locking: `creada` -> `cancelada`; a paid order still holding the
 *    buyer's money -> `reembolsada` through refundPaidOrder (one gateway refund + one `refund`
 *    ledger entry), closing its open dispute; `liquidada` -> needsManualReview (the seller was paid).
 *
 * Idempotent: calling it again (e.g. after a failure, or concurrently) only processes the leftovers;
 * on a fully processed event every count is 0. A failing order rolls back alone and is counted in
 * `failed`. A payout already queued for a refunded `liberada` order is left as is (payouts.status has
 * no void value): the payout code must re-check under the order lock that the order is `liberada`.
 */
export async function cancelEvent(
  db: Db,
  gw: PaymentGateway,
  actor: Actor,
  eventId: string,
  now: Date = new Date(),
): Promise<CancelEventResult> {
  assertAdmin(actor);
  if (!isUuid(eventId)) throw new NotFoundError('Event not found');
  const result: CancelEventResult = { refunded: 0, manualReview: 0, abandoned: 0, withdrawn: 0, failed: 0 };

  await db.transaction(async (tx) => {
    const [ev] = await tx
      .select({ status: events.status })
      .from(events)
      .where(eq(events.id, eventId))
      .for('update');
    if (!ev) throw new NotFoundError('Event not found');
    // Already cancelled: a resumed run that only settles what a previous one left behind.
    if (ev.status !== 'cancelled') await tx.update(events).set({ status: 'cancelled' }).where(eq(events.id, eventId));
    await audit(tx, {
      actorId: actor.userId,
      action: ev.status === 'cancelled' ? 'event.cancel_resumed' : 'event.cancelled',
      entity: 'event',
      entityId: eventId,
      detail: { from: ev.status },
    });
  });

  result.withdrawn = await withdrawListings(db, actor, eventId);

  const candidates = await db
    .select({ id: orders.id, listingId: orders.listingId })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .where(
      and(
        eq(listings.eventId, eventId),
        or(
          inArray(orders.state, ['creada', ...REFUNDABLE]),
          and(eq(orders.state, 'liquidada'), eq(orders.needsManualReview, false)),
        ),
      ),
    )
    .orderBy(asc(orders.createdAt), asc(orders.id));

  for (const c of candidates) {
    try {
      const outcome = await settleOrder(db, gw, actor, eventId, c, now);
      if (outcome !== 'skipped') result[outcome]++;
    } catch (e) {
      result.failed++;
      // Name only: messages can carry ids, provider references or bound query parameters.
      console.error('cancelEvent: order failed', e instanceof Error ? e.name : 'UnknownError');
    }
  }
  return result;
}

/** `pending`/`verified` listings of the event -> `withdrawn`, one audit row each. */
function withdrawListings(db: Db, actor: Actor, eventId: string): Promise<number> {
  return db.transaction(async (tx) => {
    // Locked in id order, so concurrent runs take these row locks in the same order.
    const open = await tx
      .select({ id: listings.id, status: listings.status })
      .from(listings)
      .where(and(eq(listings.eventId, eventId), inArray(listings.status, ['pending', 'verified'])))
      .orderBy(asc(listings.id))
      .for('update');
    if (open.length === 0) return 0;
    const withdrawn = await tx
      .update(listings)
      .set({ status: 'withdrawn' })
      .where(
        and(
          inArray(
            listings.id,
            open.map((l) => l.id),
          ),
          inArray(listings.status, ['pending', 'verified']),
        ),
      )
      .returning({ id: listings.id });
    const from = new Map(open.map((l) => [l.id, l.status]));
    for (const { id } of withdrawn) {
      await audit(tx, {
        actorId: actor.userId,
        action: 'listing.withdrawn',
        entity: 'listing',
        entityId: id,
        detail: { eventId, from: from.get(id), cause: 'event_cancelled' },
      });
    }
    return withdrawn.length;
  });
}

function settleOrder(
  db: Db,
  gw: PaymentGateway,
  actor: Actor,
  eventId: string,
  ref: { id: string; listingId: string },
  now: Date,
): Promise<Outcome> {
  return db.transaction(async (tx) => {
    // Listing before order: the lock order of checkout and the payment webhook (service.ts).
    await tx.select({ id: listings.id }).from(listings).where(eq(listings.id, ref.listingId)).for('update');
    const order = await lockOrderForUpdate(tx, ref.id);
    if (!order) return 'skipped';

    // Re-checked under the lock: another run, a dispute resolution, the maintenance job or a
    // payment may have moved the order since it was listed.
    if (order.state === 'creada') {
      await applyTransition(tx, order, 'CHECKOUT_ABANDONED', {
        action: 'order.cancelled_by_event',
        actorId: actor.userId,
        detail: { eventId },
      });
      return 'abandoned';
    }

    if (REFUNDABLE.includes(order.state)) {
      const disputeIds = await closeOpenDisputes(tx, actor, order, eventId, now);
      await refundPaidOrder(tx, gw, order, 'EVENT_CANCELLED', {
        action: 'order.event_cancelled',
        actorId: actor.userId,
        detail: disputeIds.length ? { eventId, disputeIds } : { eventId },
      });
      return 'refunded';
    }

    if (order.state === 'liquidada' && !order.needsManualReview) {
      // The seller was already paid out: refunding the buyer here would pay the sale twice.
      await tx
        .update(orders)
        .set({ needsManualReview: true })
        .where(and(eq(orders.id, order.id), eq(orders.state, 'liquidada')));
      await audit(tx, {
        actorId: actor.userId,
        action: 'order.manual_review_required',
        entity: 'order',
        entityId: order.id,
        detail: { eventId, state: order.state, cause: 'EVENT_CANCELLED' },
      });
      return 'manualReview';
    }

    return 'skipped'; // cancelada, reembolsada, or liquidada already flagged
  });
}

/** Closes the order's open dispute(s) as refunded; the caller holds the order lock (order -> dispute). */
async function closeOpenDisputes(tx: Tx, actor: Actor, order: OrderRow, eventId: string, now: Date) {
  const open = await tx
    .select({ id: disputes.id })
    .from(disputes)
    .where(and(eq(disputes.orderId, order.id), eq(disputes.status, 'open')))
    .for('update');
  for (const d of open) {
    await tx
      .update(disputes)
      .set({ status: 'refunded', resolvedBy: actor.userId, resolvedAt: now })
      .where(and(eq(disputes.id, d.id), eq(disputes.status, 'open')));
    await audit(tx, {
      actorId: actor.userId,
      action: 'dispute.closed',
      entity: 'order',
      entityId: order.id,
      detail: { disputeId: d.id, status: 'refunded', cause: 'EVENT_CANCELLED', eventId },
    });
  }
  return open.map((d) => d.id);
}
