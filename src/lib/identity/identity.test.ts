import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';
import { IdentityRequiredError, IdentityStateError } from './errors';
import { assertCanSell, reviewIdentity, submitIdentity } from './identity';

type Status = 'none' | 'pending' | 'approved' | 'rejected';

let db: Db;
let admin: Actor;
let phoneSeq = 0;

async function insertUser(
  role: 'user' | 'admin' = 'user',
  identityStatus: Status = 'none',
): Promise<string> {
  phoneSeq += 1;
  const phone = `+5076${String(phoneSeq).padStart(7, '0')}`;
  const [row] = await db
    .insert(users)
    .values({ phone, role, identityStatus })
    .returning({ id: users.id });
  return row.id;
}

async function statusOf(userId: string) {
  const [row] = await db
    .select({ s: users.identityStatus, doc: users.idDocPath, selfie: users.selfiePath })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

const docPath = (owner: string) => `identity/${owner}/${randomUUID()}`;
const selfiePath = (owner: string) => `selfie/${owner}/${randomUUID()}`;

beforeEach(async () => {
  db = await makeTestDb();
  admin = { userId: await insertUser('admin'), role: 'admin', mfa: true };
});

describe('assertCanSell', () => {
  it.each(['none', 'pending', 'rejected'] as const)('throws IdentityRequiredError when %s', async (s) => {
    const id = await insertUser('user', s);
    await expect(assertCanSell(db, id)).rejects.toBeInstanceOf(IdentityRequiredError);
  });

  it('passes when approved', async () => {
    const id = await insertUser('user', 'approved');
    await expect(assertCanSell(db, id)).resolves.toBeUndefined();
  });

  it('throws IdentityRequiredError for an unknown user', async () => {
    await expect(assertCanSell(db, randomUUID())).rejects.toBeInstanceOf(IdentityRequiredError);
  });
});

describe('submitIdentity', () => {
  it.each(['none', 'rejected'] as const)('moves %s to pending and stores both paths', async (s) => {
    const id = await insertUser('user', s);
    const d = docPath(id);
    const p = selfiePath(id);
    await submitIdentity(db, id, d, p);
    expect(await statusOf(id)).toEqual({ s: 'pending', doc: d, selfie: p });
  });

  it.each(['pending', 'approved'] as const)('refuses to resubmit while %s', async (s) => {
    const id = await insertUser('user', s);
    await expect(submitIdentity(db, id, docPath(id), selfiePath(id))).rejects.toBeInstanceOf(
      IdentityStateError,
    );
    expect((await statusOf(id)).s).toBe(s);
    expect((await statusOf(id)).doc).toBeNull();
  });

  it('refuses paths that do not belong to the user', async () => {
    const id = await insertUser();
    const other = await insertUser();
    await expect(submitIdentity(db, id, docPath(other), selfiePath(id))).rejects.toThrow();
    await expect(submitIdentity(db, id, docPath(id), selfiePath(other))).rejects.toThrow();
    await expect(submitIdentity(db, id, selfiePath(id), docPath(id))).rejects.toThrow();
    expect((await statusOf(id)).s).toBe('none');
  });

  it('writes an audit row', async () => {
    const id = await insertUser();
    await submitIdentity(db, id, docPath(id), selfiePath(id));
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'identity.submit'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: id, entity: 'user', entityId: id });
  });
});

describe('reviewIdentity', () => {
  it('rejects a non-admin reviewer', async () => {
    const id = await insertUser('user', 'pending');
    const reviewer: Actor = { userId: await insertUser(), role: 'user', mfa: true };
    await expect(reviewIdentity(db, reviewer, id, 'approved')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await statusOf(id)).s).toBe('pending');
  });

  it('rejects an admin without 2FA', async () => {
    const id = await insertUser('user', 'pending');
    await expect(
      reviewIdentity(db, { ...admin, mfa: false }, id, 'approved'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await statusOf(id)).s).toBe('pending');
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it.each(['approved', 'rejected'] as const)('moves pending to %s with an audit row', async (d) => {
    const id = await insertUser('user', 'pending');
    await reviewIdentity(db, admin, id, d);
    expect((await statusOf(id)).s).toBe(d);
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.userId,
      action: 'identity.review',
      entity: 'user',
      entityId: id,
      detail: { decision: d },
    });
  });

  it.each(['none', 'approved', 'rejected'] as const)('throws when the status is %s', async (s) => {
    const id = await insertUser('user', s);
    await expect(reviewIdentity(db, admin, id, 'approved')).rejects.toBeInstanceOf(IdentityStateError);
    expect((await statusOf(id)).s).toBe(s);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it('throws for an unknown user', async () => {
    await expect(reviewIdentity(db, admin, randomUUID(), 'approved')).rejects.toThrow();
  });

  it('rejects an unknown decision', async () => {
    const id = await insertUser('user', 'pending');
    await expect(
      reviewIdentity(db, admin, id, 'none' as unknown as 'approved'),
    ).rejects.toThrow();
    expect((await statusOf(id)).s).toBe('pending');
  });

  it('makes assertCanSell pass after approval', async () => {
    const id = await insertUser();
    await submitIdentity(db, id, docPath(id), selfiePath(id));
    await expect(assertCanSell(db, id)).rejects.toBeInstanceOf(IdentityRequiredError);
    await reviewIdentity(db, admin, id, 'approved');
    await expect(assertCanSell(db, id)).resolves.toBeUndefined();
  });
});
