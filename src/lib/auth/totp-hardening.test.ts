import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { createSession, getSession } from './session';
import { TotpAlreadyEnrolledError, completeMfa, enrollTotp, verifyTotp } from './totp';

// Independent RFC 6238 reference implementation.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totpAt(secret: string, atMs: number): string {
  let bits = '';
  for (const c of secret) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const mac = createHmac('sha1', key).update(msg).digest();
  const o = mac[mac.length - 1] & 0xf;
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

const T = new Date('2027-02-01T12:00:10Z').getTime(); // 10 s into a 30 s step
const at = (ms: number) => new Date(ms);

let db: Db;
let adminId: string;
let secret: string;
beforeEach(async () => {
  db = await makeTestDb();
  const [a] = await db.insert(users).values({ phone: '+50760000001', role: 'admin' }).returning();
  adminId = a.id;
  ({ secret } = await enrollTotp(db, adminId));
});

describe('TOTP replay protection (SEG-04)', () => {
  it('accepts a code once: the same code again is refused, even inside its window', async () => {
    const code = totpAt(secret, T);
    expect(await verifyTotp(db, adminId, code, at(T))).toBe(true);
    expect(await verifyTotp(db, adminId, code, at(T + 5_000))).toBe(false);
  });

  it("the next window's code still works", async () => {
    expect(await verifyTotp(db, adminId, totpAt(secret, T), at(T))).toBe(true);
    expect(await verifyTotp(db, adminId, totpAt(secret, T + 30_000), at(T + 30_000))).toBe(true);
  });

  it("a previous window's code is refused once a newer one was accepted", async () => {
    expect(await verifyTotp(db, adminId, totpAt(secret, T), at(T))).toBe(true);
    // Still inside the ±1 step tolerance, but older than the last accepted step.
    expect(await verifyTotp(db, adminId, totpAt(secret, T - 30_000), at(T))).toBe(false);
  });

  it('stores the last accepted step', async () => {
    await verifyTotp(db, adminId, totpAt(secret, T), at(T));
    const [row] = await db.select({ step: users.totpLastStep }).from(users).where(eq(users.id, adminId));
    expect(row.step).toBe(Math.floor(T / 30_000));
  });

  it('two parallel uses of one code: exactly one wins', async () => {
    const code = totpAt(secret, T);
    const results = await Promise.all([1, 2, 3].map(() => verifyTotp(db, adminId, code, at(T))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('completeMfa cannot upgrade a second session with an already used code', async () => {
    const s1 = await createSession(db, adminId, 'admin', at(T));
    const s2 = await createSession(db, adminId, 'admin', at(T));
    const code = totpAt(secret, T);
    expect(await completeMfa(db, s1, code, at(T))).toBe(true);
    expect(await completeMfa(db, s2, code, at(T))).toBe(false);
    expect((await getSession(db, s2, at(T)))!.mfa).toBe(false);
  });
});

describe('enrollTotp overwrite guard', () => {
  it('refuses to replace an existing secret without { rotate: true }', async () => {
    await expect(enrollTotp(db, adminId)).rejects.toBeInstanceOf(TotpAlreadyEnrolledError);
    const [row] = await db.select({ s: users.totpSecret }).from(users).where(eq(users.id, adminId));
    expect(row.s).toBe(secret);
  });

  it('rotates on request: the old secret stops working, the new one works', async () => {
    const { secret: fresh } = await enrollTotp(db, adminId, { rotate: true });
    expect(fresh).not.toBe(secret);
    expect(await verifyTotp(db, adminId, totpAt(secret, T), at(T))).toBe(false);
    expect(await verifyTotp(db, adminId, totpAt(fresh, T), at(T))).toBe(true);
  });
});

describe('corrupt stored secret', () => {
  it.each(['not-base32!!', '1111', 'abc', ' '])('verifyTotp is false, never throws (%j)', async (bad) => {
    await db.update(users).set({ totpSecret: bad }).where(eq(users.id, adminId));
    await expect(verifyTotp(db, adminId, '123456', at(T))).resolves.toBe(false);
  });
});
