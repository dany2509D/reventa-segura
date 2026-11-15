import { z } from 'zod';
import { audit } from '@/lib/audit/audit';
import { assertAdmin } from '@/lib/authz';
import { events } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { ValidationError } from '@/lib/errors';

const INT32_MAX = 2_147_483_647;

// Unknown keys (e.g. `status`, `id`) are stripped, so callers cannot set them.
export const newEventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  venue: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(50).max(5000),
  startsAt: z.date(),
  faceValueCents: z.number().int().positive().max(INT32_MAX),
  allowsTransfer: z.boolean(),
  resaleProhibited: z.boolean(),
});

export type NewEvent = z.input<typeof newEventSchema>;
export type EventRow = typeof events.$inferSelect;

export async function createEvent(
  db: Db,
  actor: Actor,
  input: NewEvent,
  now: Date = new Date(),
): Promise<EventRow> {
  assertAdmin(actor);

  const parsed = newEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid event',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const data = parsed.data;
  if (data.startsAt.getTime() <= now.getTime()) {
    throw new ValidationError('Invalid event', [
      { path: 'startsAt', message: 'startsAt must be in the future' },
    ]);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(events).values(data).returning();
    await audit(tx, {
      actorId: actor.userId,
      action: 'event.create',
      entity: 'event',
      entityId: row.id,
      detail: { name: row.name, startsAt: row.startsAt.toISOString(), faceValueCents: row.faceValueCents },
    });
    return row;
  });
}
