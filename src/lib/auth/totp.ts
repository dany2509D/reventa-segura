import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { ADMIN_SESSION_MS, hashToken } from './session';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;
const DIGITS = 6;

export class TotpAlreadyEnrolledError extends Error {
  constructor() {
    super('This admin already has a TOTP secret; pass { rotate: true } to replace it');
    this.name = 'TotpAlreadyEnrolledError';
  }
}

function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

/** Null for anything that is not a usable secret (bad characters, or fewer than 80 bits). */
function base32Decode(s: string): Buffer | null {
  let bits = '';
  for (const c of s) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return bytes.length >= 10 ? Buffer.from(bytes) : null;
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Gives an admin a new TOTP secret, shown once. Out-of-band only (npm run admin:create): there is
 * no HTTP route, so a stolen SMS session can never enroll its own second factor. An existing secret
 * is replaced only with { rotate: true }, so a stray call cannot silently lock an admin out or
 * swap their factor.
 */
export async function enrollTotp(
  db: Db,
  adminId: string,
  { rotate = false }: { rotate?: boolean } = {},
): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = base32Encode(randomBytes(20)); // 160 bits -> 32 base32 chars
  // Rotation is the response to a lost phone or a suspected leak: every existing session of that
  // admin goes too, otherwise a 2FA-verified session held by an attacker would survive it.
  const [user] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ totpSecret: secret })
      .where(and(eq(users.id, adminId), eq(users.role, 'admin'), rotate ? undefined : isNull(users.totpSecret)))
      .returning({ phone: users.phone });
    if (updated.length > 0 && rotate) await tx.delete(sessions).where(eq(sessions.userId, adminId));
    return updated;
  });
  if (!user) {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, adminId), eq(users.role, 'admin')));
    if (admin) throw new TotpAlreadyEnrolledError();
    throw new Error('Admin not found');
  }
  const label = encodeURIComponent(`Reventa Segura:${user.phone}`);
  const issuer = encodeURIComponent('Reventa Segura');
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
  return { secret, otpauthUrl };
}

/**
 * Checks a TOTP code (current step ±1) and consumes it: each time step is accepted at most once
 * per admin, and never one at or before the last accepted step, so an observed code cannot be
 * replayed. The step is claimed with a conditional UPDATE, so of parallel uses exactly one wins.
 * A corrupt stored secret is a plain refusal, never an exception.
 */
export async function verifyTotp(
  db: Db,
  adminId: string,
  code: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const [user] = await db
    .select({ totpSecret: users.totpSecret, lastStep: users.totpLastStep })
    .from(users)
    .where(eq(users.id, adminId));
  if (!user?.totpSecret) return false;
  const secret = base32Decode(user.totpSecret);
  if (!secret) return false;

  const current = Math.floor(now.getTime() / 1000 / STEP_S);
  const given = Buffer.from(code);
  let matched: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    // Compare every candidate (constant work), keep the newest match.
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), given)) matched = step;
  }
  if (matched === null) return false;
  if (user.lastStep !== null && matched <= user.lastStep) return false;

  const claimed = await db
    .update(users)
    .set({ totpLastStep: matched })
    .where(and(eq(users.id, adminId), or(isNull(users.totpLastStep), lt(users.totpLastStep, matched))))
    .returning({ id: users.id });
  return claimed.length === 1;
}

export async function completeMfa(
  db: Db,
  sessionToken: string,
  code: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      role: users.role,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), gt(sessions.expiresAt, now)));
  if (!row || row.role !== 'admin') return false;
  if (now.getTime() - row.createdAt.getTime() >= ADMIN_SESSION_MS) return false;
  if (!(await verifyTotp(db, row.userId, code, now))) return false;
  await db.update(sessions).set({
      mfa: true,
      expiresAt: new Date(Math.min(row.expiresAt.getTime(), now.getTime() + ADMIN_SESSION_MS)),
    }).where(eq(sessions.id, row.id));
  return true;
}
