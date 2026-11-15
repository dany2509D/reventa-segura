import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { ADMIN_SESSION_MS, hashToken } from './session';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;
const DIGITS = 6;

function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = '';
  for (const c of s) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error('Invalid base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}

export async function enrollTotp(
  db: Db,
  adminId: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = base32Encode(randomBytes(20)); // 160 bits -> 32 base32 chars
  const [user] = await db
    .update(users)
    .set({ totpSecret: secret })
    .where(and(eq(users.id, adminId), eq(users.role, 'admin')))
    .returning({ phone: users.phone });
  if (!user) throw new Error('Admin not found');
  const label = encodeURIComponent(`Reventa Segura:${user.phone}`);
  const issuer = encodeURIComponent('Reventa Segura');
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
  return { secret, otpauthUrl };
}

export async function verifyTotp(
  db: Db,
  adminId: string,
  code: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const [user] = await db
    .select({ totpSecret: users.totpSecret })
    .from(users)
    .where(eq(users.id, adminId));
  if (!user?.totpSecret) return false;
  const secret = base32Decode(user.totpSecret);
  const step = Math.floor(now.getTime() / 1000 / STEP_S);
  const given = Buffer.from(code);
  let ok = false;
  for (const delta of [-1, 0, 1]) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step + delta)), given)) ok = true;
  }
  return ok;
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
