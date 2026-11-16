import { and, eq } from 'drizzle-orm';
import { assertAdmin } from '@/lib/authz';
import { disputes } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { assertOwnedFile, confirmationWindowEndsAt } from '@/lib/entry/confirmation';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { applyTransition } from '@/lib/orders/service';
import {
  eventForOrder,
  isUuid,
  lockOrderForUpdate,
  refundPaidOrder,
  releaseOrder,
  type OnReleased,
} from '@/lib/orders/settlement';
import { InvalidTransitionError, type OrderState } from '@/lib/orders/state-machine';
import type { PaymentGateway } from '@/lib/payments/gateway';

export const MAX_REASON_LENGTH = 2000;
export const MAX_EVIDENCE_FILES = 5;
/** States from which the buyer may open a dispute (before the window closes). */
export const DISPUTABLE_STATES: readonly OrderState[] = [
  'transferencia_pendiente',
  'entrada_recibida',
  'ingreso_confirmado',
];

export type DisputeDecision = 'refund' | 'release';

export class DisputeWindowClosedError extends Error {
  constructor(message = 'The dispute window for this order has closed') {
    super(message);
    this.name = 'DisputeWindowClosedError';
  }
}

export class DisputeAlreadyOpenError extends Error {
  constructor(message = 'This order already has an open dispute') {
    super(message);
    this.name = 'DisputeAlreadyOpenError';
  }
}

export class DisputeAlreadyResolvedError extends Error {
  constructor(message = 'This dispute was already resolved') {
    super(message);
    this.name = 'DisputeAlreadyResolvedError';
  }
}

/*
 * Concurrency: every function locks the order row (SELECT ... FOR UPDATE) before reading or
 * writing its dispute, and the maintenance job takes the same lock before releasing or refunding.
 * Whoever locks first wins; the other re-checks the state under the lock and backs off.
 */

/**
 * The buyer disputes the sale (RF-15) until the confirmation window ends (event start + 12 h).
 * Inserts one `open` dispute and moves the order to `disputada`, in one transaction.
 */
export async function openDispute(
  db: Db,
  buyerId: string,
  orderId: string,
  reason: string,
  evidencePaths: string[],
  now: Date = new Date(),
): Promise<{ disputeId: string }> {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > MAX_REASON_LENGTH) {
    throw new ValidationError('Invalid reason', [
      { path: 'reason', message: `required, at most ${MAX_REASON_LENGTH} characters` },
    ]);
  }
  if (
    !Array.isArray(evidencePaths) ||
    evidencePaths.length > MAX_EVIDENCE_FILES ||
    new Set(evidencePaths).size !== evidencePaths.length
  ) {
    throw new ValidationError('Invalid evidence', [
      { path: 'evidencePaths', message: `at most ${MAX_EVIDENCE_FILES} distinct files` },
    ]);
  }
  for (const p of evidencePaths) assertOwnedFile(p, 'evidence', buyerId, 'evidencePaths');

  return db.transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenError();

    const [open] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(eq(disputes.orderId, order.id), eq(disputes.status, 'open')))
      .limit(1);
    if (open || order.state === 'disputada') throw new DisputeAlreadyOpenError();
    if (!DISPUTABLE_STATES.includes(order.state)) throw new InvalidTransitionError(order.state, 'DISPUTE_OPENED');

    const event = await eventForOrder(tx, order);
    if (now.getTime() >= confirmationWindowEndsAt(event.startsAt).getTime()) throw new DisputeWindowClosedError();

    const [dispute] = await tx
      .insert(disputes)
      .values({ orderId: order.id, openedBy: buyerId, reason: text, evidencePaths, status: 'open', createdAt: now })
      .returning({ id: disputes.id });
    await applyTransition(tx, order, 'DISPUTE_OPENED', {
      action: 'dispute.opened',
      actorId: buyerId,
      detail: { disputeId: dispute.id, evidenceCount: evidencePaths.length },
    });
    return { disputeId: dispute.id };
  });
}

/**
 * An admin with 2FA resolves an open dispute: 'refund' gives the buyer the full price back
 * (`reembolsada`), 'release' frees the money for the seller (`liberada`, then `onReleased`).
 */
export async function resolveDispute(
  db: Db,
  gw: PaymentGateway,
  admin: Actor,
  disputeId: string,
  decision: DisputeDecision,
  now: Date = new Date(),
  hooks: { onReleased?: OnReleased } = {},
): Promise<void> {
  assertAdmin(admin);
  if (decision !== 'refund' && decision !== 'release') {
    throw new ValidationError('Invalid decision', [{ path: 'decision', message: "must be 'refund' or 'release'" }]);
  }
  if (!isUuid(disputeId)) throw new NotFoundError('Dispute not found');
  const [ref] = await db.select({ orderId: disputes.orderId }).from(disputes).where(eq(disputes.id, disputeId));
  if (!ref) throw new NotFoundError('Dispute not found');

  await db.transaction(async (tx) => {
    // Lock order before dispute, the same order openDispute uses.
    const order = await lockOrderForUpdate(tx, ref.orderId);
    if (!order) throw new Error(`Order ${ref.orderId} of dispute ${disputeId} not found`);
    const [dispute] = await tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update');
    if (!dispute) throw new NotFoundError('Dispute not found');
    if (dispute.status !== 'open') throw new DisputeAlreadyResolvedError();

    const orderEvent = decision === 'refund' ? 'DISPUTE_REFUND' : 'DISPUTE_RELEASE';
    if (order.state !== 'disputada') throw new InvalidTransitionError(order.state, orderEvent);

    const closed = await tx
      .update(disputes)
      .set({ status: decision === 'refund' ? 'refunded' : 'released', resolvedBy: admin.userId, resolvedAt: now })
      .where(and(eq(disputes.id, disputeId), eq(disputes.status, 'open')))
      .returning({ id: disputes.id });
    if (closed.length !== 1) throw new DisputeAlreadyResolvedError();

    const o = { action: 'dispute.resolved', actorId: admin.userId, detail: { disputeId, decision } };
    if (decision === 'refund') await refundPaidOrder(tx, gw, order, 'DISPUTE_REFUND', o);
    else await releaseOrder(tx, order, 'DISPUTE_RELEASE', o, hooks.onReleased);
  });
}
