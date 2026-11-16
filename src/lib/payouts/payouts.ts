import { eq } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { assertAdmin } from '@/lib/authz';
import { listings, orders, payouts } from '@/lib/db/schema';
import type { Actor, Db, Tx } from '@/lib/db/types';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { appendEntry } from '@/lib/orders/ledger';
import { applyTransition } from '@/lib/orders/service';
import { isUuid, lockOrderForUpdate, type OnReleased } from '@/lib/orders/settlement';
import { PayoutStateError } from './errors';

/*
 * v1 pays sellers by manual bank transfer: the platform never holds money, an operator pays from
 * the company account and records the bank reference here. The adapter boundary lets a provider
 * payout replace it later without touching the release flow.
 *
 * A payout is only ever created for an order that is `liberada`, and only paid while the order is
 * still `liberada`: a refund (e.g. event cancelled) after queueing makes the payout unpayable.
 * Refunds do NOT reverse the fee/seller_due ledger rows, so payouts key off the order state and the
 * order's price/fee, never off summing seller_due.
 */

export type PayoutInput = { orderId: string; sellerId: string; amountCents: number };

export interface PayoutAdapter {
  /** Runs inside the releasing transaction; must be idempotent per order. */
  requestPayout(tx: Tx, input: PayoutInput): Promise<{ payoutId: string }>;
}

export class ManualPayoutAdapter implements PayoutAdapter {
  async requestPayout(tx: Tx, input: PayoutInput): Promise<{ payoutId: string }> {
    const [created] = await tx
      .insert(payouts)
      .values({ ...input, status: 'queued' })
      .onConflictDoNothing({ target: payouts.orderId })
      .returning({ id: payouts.id });
    if (created) return { payoutId: created.id };
    const [existing] = await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.orderId, input.orderId));
    return { payoutId: existing.id };
  }
}

/** `onReleased` hook for runMaintenance / resolveDispute: queues the seller payout for a released order. */
export function createPayoutHook(adapter: PayoutAdapter): OnReleased {
  return async (tx, order) => {
    if (order.state !== 'liberada') throw new PayoutStateError(`Order ${order.id} is ${order.state}, not liberada`);
    const [listing] = await tx.select({ sellerId: listings.sellerId }).from(listings).where(eq(listings.id, order.listingId));
    if (!listing) throw new Error(`Listing of order ${order.id} not found`);
    const amountCents = order.priceCents - order.feeCents;
    if (amountCents <= 0) {
      // Nothing to pay (a sale so small the commission rounds up to the whole price).
      await audit(tx, {
        actorId: null,
        action: 'payout.skipped_zero_amount',
        entity: 'order',
        entityId: order.id,
        detail: { priceCents: order.priceCents, feeCents: order.feeCents },
      });
      return;
    }
    const { payoutId } = await adapter.requestPayout(tx, { orderId: order.id, sellerId: listing.sellerId, amountCents });
    await audit(tx, {
      actorId: null,
      action: 'payout.queued',
      entity: 'payout',
      entityId: payoutId,
      detail: { orderId: order.id, amountCents },
    });
  };
}

export const queuePayoutOnRelease: OnReleased = createPayoutHook(new ManualPayoutAdapter());

const MAX_BANK_REF = 100;

/**
 * An operator records that the seller was paid by bank transfer. One transaction: payout → paid,
 * order liberada → liquidada, `payout` ledger entry (-amount, ref = bank reference), audit row.
 */
export async function markPayoutPaid(db: Db, admin: Actor, payoutId: string, bankRef: string): Promise<void> {
  assertAdmin(admin);
  const ref = typeof bankRef === 'string' ? bankRef.trim() : '';
  if (!ref || ref.length > MAX_BANK_REF) {
    throw new ValidationError('Invalid bank reference', [{ path: 'bankRef', message: `1-${MAX_BANK_REF} characters required` }]);
  }
  if (!isUuid(payoutId)) throw new ValidationError('Invalid payout id', [{ path: 'payoutId', message: 'not a uuid' }]);

  await db.transaction(async (tx) => {
    const [peek] = await tx.select({ orderId: payouts.orderId }).from(payouts).where(eq(payouts.id, payoutId));
    if (!peek) throw new NotFoundError('Payout not found');
    // Lock order first (the order every other money path uses), then the payout row.
    const order = await lockOrderForUpdate(tx, peek.orderId);
    if (!order) throw new NotFoundError('Order not found');
    const [payout] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for('update');
    if (!payout) throw new NotFoundError('Payout not found');
    if (payout.status !== 'queued') throw new PayoutStateError('Payout already paid');
    if (payout.sellerId === admin.userId) throw new ForbiddenError(); // separation of duties
    if (order.state !== 'liberada') throw new PayoutStateError(`Order is ${order.state}, not liberada`);

    await applyTransition(tx, order, 'PAYOUT_DONE', {
      action: 'order.liquidated',
      actorId: admin.userId,
      detail: { payoutId, bankRef: ref },
    });
    await tx.update(payouts).set({ status: 'paid', bankRef: ref, paidAt: new Date() }).where(eq(payouts.id, payoutId));
    await appendEntry(tx, { orderId: order.id, kind: 'payout', amountCents: -payout.amountCents, ref });
    await audit(tx, {
      actorId: admin.userId,
      action: 'payout.paid',
      entity: 'payout',
      entityId: payoutId,
      detail: { orderId: order.id, amountCents: payout.amountCents, bankRef: ref },
    });
  });
}
