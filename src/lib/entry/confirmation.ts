import type { Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { applyTransition } from '@/lib/orders/service';
import { eventForOrder, lockOrderForUpdate } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { parseFilePath } from '@/lib/uploads/uploads';
import { isWithinRadius } from './geo';

const HOUR = 60 * 60 * 1000;
/** The buyer can confirm entry / dispute until this long after the event starts. */
export const CONFIRMATION_WINDOW_MS = 12 * HOUR;
/** Entry can be confirmed from this long before the event starts (doors open early). */
export const ENTRY_OPENS_BEFORE_MS = 3 * HOUR;

export class EntryWindowError extends Error {
  constructor(message = 'Entry can only be confirmed from 3 h before the event until the window closes') {
    super(message);
    this.name = 'EntryWindowError';
  }
}

/** End of the confirmation/dispute window (exclusive): event start + 12 h. */
export function confirmationWindowEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + CONFIRMATION_WINDOW_MS);
}

/** Throws ValidationError unless `path` is a private file of `kind` owned by `ownerId`. */
export function assertOwnedFile(path: unknown, kind: 'proof' | 'evidence', ownerId: string, field: string): void {
  const parsed = typeof path === 'string' && path ? parseFilePath(path) : null;
  if (!parsed || parsed.kind !== kind || parsed.ownerId !== ownerId) {
    throw new ValidationError(`Invalid ${field}`, [{ path: field, message: `must be a ${kind} file of the buyer` }]);
  }
}

/**
 * The buyer confirms they got in (RF-14): `entrada_recibida` -> `ingreso_confirmado`.
 * Geolocation is only a signal (`geoOk` is recorded, never blocks); the scan photo is required.
 */
export async function confirmEntry(
  db: Db,
  buyerId: string,
  orderId: string,
  input: { lat: number; lng: number; photoPath: string },
  now: Date = new Date(),
): Promise<{ geoOk: boolean }> {
  assertOwnedFile(input.photoPath, 'proof', buyerId, 'photoPath');
  return db.transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenError();
    if (order.state !== 'entrada_recibida') throw new InvalidTransitionError(order.state, 'ENTRY_CONFIRMED');

    const event = await eventForOrder(tx, order);
    const t = now.getTime();
    const opensAt = event.startsAt.getTime() - ENTRY_OPENS_BEFORE_MS;
    if (t < opensAt || t >= confirmationWindowEndsAt(event.startsAt).getTime()) throw new EntryWindowError();

    const geoOk = isWithinRadius({ lat: input.lat, lng: input.lng }, { lat: event.lat, lng: event.lng }, event.radiusM);
    await applyTransition(tx, order, 'ENTRY_CONFIRMED', {
      action: 'order.entry_confirmed',
      actorId: buyerId,
      detail: { geoOk, photoPath: input.photoPath, confirmedAt: now.toISOString() },
    });
    return { geoOk };
  });
}
