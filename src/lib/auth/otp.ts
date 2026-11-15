import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { otpCodes, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { InvalidPhoneError, RateLimitError } from './errors';
import { normalizePanamaPhone } from './phone';
import { createSession } from './session';
import type { SmsSender } from './sms';

export type { SmsSender } from './sms';
export { ConsoleSmsSender } from './sms';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

function hashCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export async function requestOtp(
  db: Db,
  phoneInput: string,
  sender: SmsSender,
  now: Date = new Date(),
): Promise<void> {
  const phone = normalizePanamaPhone(phoneInput);
  if (!phone) throw new InvalidPhoneError();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(
      and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, new Date(now.getTime() - HOUR_MS))),
    );
  if (n >= OTP_MAX_REQUESTS_PER_HOUR) throw new RateLimitError();

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  await db.insert(otpCodes).values({
    phone,
    salt,
    codeHash: hashCode(salt, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
  });
  await sender.send(phone, `Tu código de Reventa Segura es ${code}. Vence en 10 minutos.`);
}

export async function verifyOtp(
  db: Db,
  phoneInput: string,
  code: string,
  now: Date = new Date(),
): Promise<{ userId: string; sessionToken: string } | null> {
  const phone = normalizePanamaPhone(phoneInput);
  if (!phone) return null;

  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt <= now || row.attempts >= OTP_MAX_ATTEMPTS) return null;

  const expected = Buffer.from(row.codeHash, 'hex');
  const actual = Buffer.from(hashCode(row.salt, code), 'hex');
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!ok) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, row.id));
    return null;
  }

  // Atomically consume: only one concurrent verifier can win.
  const consumed = await db
    .update(otpCodes)
    .set({ usedAt: now })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.usedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length === 0) return null;

  await db.insert(users).values({ phone }).onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.phone, phone));
  const sessionToken = await createSession(db, user.id, user.role, now);
  return { userId: user.id, sessionToken };
}
