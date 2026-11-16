import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { configInt } from '@/lib/config/app-config';
import { otpCodes, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { InvalidPhoneError, RateLimitError, SmsCapError } from './errors';
import { normalizePanamaPhone } from './phone';
import { createSession } from './session';
import type { SmsSender } from './sms';

export type { SmsSender } from './sms';
export { ConsoleSmsSender } from './sms';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
/** app_config key: SMS codes the whole platform may send in any 24 h (cost guard, SEG-07/RNF-12). */
export const SMS_DAILY_CAP_KEY = 'smsDailyCap';
export const DEFAULT_SMS_DAILY_CAP = 500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hashCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

/**
 * Sends a login code. Each stored code is one SMS, so otp_codes is also the SMS ledger: the
 * per-phone limit (5/hour) and the platform-wide cap (smsDailyCap per sliding 24 h) both count
 * rows. One global advisory lock serialises the check-and-insert, so neither limit can be
 * overshot by a parallel burst (login traffic is low; the lock is held for three statements).
 * The SMS goes out after commit: a failed send costs a code, never a duplicate.
 */
export async function requestOtp(
  db: Db,
  phoneInput: string,
  sender: SmsSender,
  now: Date = new Date(),
): Promise<void> {
  const phone = normalizePanamaPhone(phoneInput);
  if (!phone) throw new InvalidPhoneError();

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('otp:request'))`);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, new Date(now.getTime() - HOUR_MS))));
    if (n >= OTP_MAX_REQUESTS_PER_HOUR) throw new RateLimitError();

    const cap = await configInt(tx, SMS_DAILY_CAP_KEY, DEFAULT_SMS_DAILY_CAP);
    const [{ sent }] = await tx
      .select({ sent: sql<number>`count(*)::int` })
      .from(otpCodes)
      .where(gt(otpCodes.createdAt, new Date(now.getTime() - DAY_MS)));
    if (sent >= cap) throw new SmsCapError(cap);

    // Half the cap (at least 1) is the most that phones WITHOUT an account may use in 24 h, so an
    // anonymous flood of made-up numbers cannot exhaust the budget that real users need to log in.
    const [known] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (!known) {
      const [{ unknown }] = await tx
        .select({ unknown: sql<number>`count(*)::int` })
        .from(otpCodes)
        .where(
          and(
            gt(otpCodes.createdAt, new Date(now.getTime() - DAY_MS)),
            sql`not exists (select 1 from users u where u.phone = ${otpCodes.phone})`,
          ),
        );
      if (unknown >= Math.max(1, Math.floor(cap / 2))) throw new SmsCapError(cap);
    }

    await tx.insert(otpCodes).values({
      phone,
      salt,
      codeHash: hashCode(salt, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      createdAt: now,
    });
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

  const [latest] = await db
    .select({ id: otpCodes.id })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!latest) return null;

  // Reserve an attempt atomically BEFORE comparing, so parallel requests cannot
  // exceed the cap. The sixth reservation matches no row and is refused.
  const [row] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(
      and(
        eq(otpCodes.id, latest.id),
        isNull(otpCodes.usedAt),
        lt(otpCodes.attempts, OTP_MAX_ATTEMPTS),
        gt(otpCodes.expiresAt, now),
      ),
    )
    .returning();
  if (!row) return null;

  const expected = Buffer.from(row.codeHash, 'hex');
  const actual = Buffer.from(hashCode(row.salt, code), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  // Atomically consume: only one concurrent verifier can win.
  const consumed = await db
    .update(otpCodes)
    .set({ usedAt: now })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.usedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length === 0) return null;

  // Revoke any other outstanding codes so an older one cannot be revived.
  await db
    .update(otpCodes)
    .set({ usedAt: now })
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)));

  await db.insert(users).values({ phone }).onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.phone, phone));
  const sessionToken = await createSession(db, user.id, user.role, now);
  return { userId: user.id, sessionToken };
}
