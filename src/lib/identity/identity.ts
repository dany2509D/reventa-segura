import { and, eq, inArray } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { assertAdmin } from '@/lib/authz';
import { users } from '@/lib/db/schema';
import type { Actor, Db, Tx } from '@/lib/db/types';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { parseFilePath, type FileKind } from '@/lib/uploads/uploads';
import { IdentityRequiredError, IdentityStateError } from './errors';

export type IdentityDecision = 'approved' | 'rejected';

function assertOwnedPath(path: string, kind: FileKind, userId: string): void {
  const parsed = parseFilePath(path);
  if (!parsed || parsed.kind !== kind || parsed.ownerId !== userId) {
    throw new ValidationError('Invalid file path', [{ path: kind, message: 'not owned by user' }]);
  }
}

// Distinguishes "no such user" from "wrong status" after a conditional UPDATE matched nothing.
async function transitionError(tx: Tx, userId: string): Promise<Error> {
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
  return row ? new IdentityStateError() : new NotFoundError('User not found');
}

// Seller uploads cédula/pasaporte + selfie: allowed from 'none' or 'rejected' only.
export async function submitIdentity(
  db: Db,
  userId: string,
  docPath: string,
  selfiePath: string,
): Promise<void> {
  assertOwnedPath(docPath, 'identity', userId);
  assertOwnedPath(selfiePath, 'selfie', userId);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ identityStatus: 'pending', idDocPath: docPath, selfiePath })
      .where(and(eq(users.id, userId), inArray(users.identityStatus, ['none', 'rejected'])))
      .returning({ id: users.id });
    if (updated.length === 0) throw await transitionError(tx, userId);
    await audit(tx, { actorId: userId, action: 'identity.submit', entity: 'user', entityId: userId });
  });
}

// Admin (with 2FA) decides on a pending identity: 'pending' → 'approved' | 'rejected'.
export async function reviewIdentity(
  db: Db,
  admin: Actor,
  userId: string,
  decision: IdentityDecision,
): Promise<void> {
  assertAdmin(admin);
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new ValidationError('Invalid decision');
  }
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ identityStatus: decision })
      .where(and(eq(users.id, userId), eq(users.identityStatus, 'pending')))
      .returning({ id: users.id });
    if (updated.length === 0) throw await transitionError(tx, userId);
    await audit(tx, {
      actorId: admin.userId,
      action: 'identity.review',
      entity: 'user',
      entityId: userId,
      detail: { decision },
    });
  });
}

export async function assertCanSell(db: Db, userId: string): Promise<void> {
  const [row] = await db
    .select({ status: users.identityStatus })
    .from(users)
    .where(eq(users.id, userId));
  if (row?.status !== 'approved') throw new IdentityRequiredError();
}
