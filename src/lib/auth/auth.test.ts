import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { otpCodes, sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { normalizePanamaPhone } from './phone';
import { getSession, revokeSession } from './session';
import { requestOtp, verifyOtp, type SmsSender } from './otp';
import { InvalidPhoneError, RateLimitError } from './errors';
import { completeMfa, enrollTotp, verifyTotp } from './totp';

const PHONE = '+50761234567';

class FakeSender implements SmsSender {
  messages: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.messages.push({ phone, text });
  }
  lastCode() {
    return /(\d{6})/.exec(this.messages.at(-1)!.text)![1];
  }
}

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// Independent RFC 6238 reference implementation for the tests.
function totpAt(secret: string, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

describe('normalizePanamaPhone', () => {
  it.each(['6123-4567', '+507 6123 4567', '50761234567', '6123 4567'])('normalizes %s', (i) => {
    expect(normalizePanamaPhone(i)).toBe(PHONE);
  });
  it.each(['+14155550100', '123', '', 'abcdefgh', '2123-4567', '+507 2123 4567', '612345678'])(
    'rejects %s',
    (i) => {
      expect(normalizePanamaPhone(i)).toBeNull();
    },
  );
});

describe('OTP', () => {
  let db: Db;
  let sender: FakeSender;
  const now = new Date('2026-01-01T12:00:00Z');
  beforeEach(async () => {
    db = await makeTestDb();
    sender = new FakeSender();
  });

  it('sends a Spanish SMS with a 6-digit code', async () => {
    await requestOtp(db, PHONE, sender, now);
    expect(sender.messages[0].phone).toBe(PHONE);
    expect(sender.messages[0].text).toMatch(
      /^Tu código de Reventa Segura es \d{6}\. Vence en 10 minutos\.$/,
    );
  });

  it('stores the code hashed, never in clear', async () => {
    await requestOtp(db, PHONE, sender, now);
    const [row] = await db.select().from(otpCodes);
    expect(JSON.stringify(row)).not.toContain(sender.lastCode());
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.salt.length).toBeGreaterThan(0);
  });

  it('verifies the right code, creating user and session', async () => {
    await requestOtp(db, PHONE, sender, now);
    const r = await verifyOtp(db, PHONE, sender.lastCode(), now);
    expect(r).not.toBeNull();
    const [u] = await db.select().from(users).where(eq(users.phone, PHONE));
    expect(u.role).toBe('user');
    expect(u.identityStatus).toBe('none');
    expect(await getSession(db, r!.sessionToken, now)).toEqual({
      userId: u.id,
      role: 'user',
      mfa: false,
    });
  });

  it('accepts a non-normalized phone on verify', async () => {
    await requestOtp(db, '6123-4567', sender, now);
    expect(await verifyOtp(db, '+507 6123 4567', sender.lastCode(), now)).not.toBeNull();
  });

  it('rejects a wrong code', async () => {
    await requestOtp(db, PHONE, sender, now);
    const wrong = sender.lastCode() === '000000' ? '111111' : '000000';
    expect(await verifyOtp(db, PHONE, wrong, now)).toBeNull();
  });

  it('rejects an expired code (>10 min)', async () => {
    await requestOtp(db, PHONE, sender, now);
    const later = new Date(now.getTime() + 10 * 60_000 + 1000);
    expect(await verifyOtp(db, PHONE, sender.lastCode(), later)).toBeNull();
  });

  it('is single use', async () => {
    await requestOtp(db, PHONE, sender, now);
    const code = sender.lastCode();
    expect(await verifyOtp(db, PHONE, code, now)).not.toBeNull();
    expect(await verifyOtp(db, PHONE, code, now)).toBeNull();
  });

  it('invalidates a code on the sixth attempt even if correct', async () => {
    await requestOtp(db, PHONE, sender, now);
    const code = sender.lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect(await verifyOtp(db, PHONE, wrong, now)).toBeNull();
    expect(await verifyOtp(db, PHONE, code, now)).toBeNull();
  });

  it('rate limits the sixth request within an hour', async () => {
    for (let i = 0; i < 5; i++) await requestOtp(db, PHONE, sender, now);
    await expect(requestOtp(db, PHONE, sender, now)).rejects.toBeInstanceOf(RateLimitError);
    expect(sender.messages).toHaveLength(5);
    // other phones unaffected; same phone fine after an hour
    await requestOtp(db, '+50769999999', sender, now);
    await requestOtp(db, PHONE, sender, new Date(now.getTime() + 61 * 60_000));
  });

  it('rejects an invalid phone', async () => {
    await expect(requestOtp(db, '+14155550100', sender, now)).rejects.toBeInstanceOf(
      InvalidPhoneError,
    );
  });
});

describe('sessions', () => {
  it('expires user sessions in 30 days and admin sessions in 8 hours', async () => {
    const db = await makeTestDb();
    const sender = new FakeSender();
    const now = new Date('2026-01-01T12:00:00Z');
    const ADMIN = '+50760000001';
    await db.insert(users).values({ phone: ADMIN, role: 'admin' });
    await requestOtp(db, PHONE, sender, now);
    const u = (await verifyOtp(db, PHONE, sender.lastCode(), now))!;
    await requestOtp(db, ADMIN, sender, now);
    const a = (await verifyOtp(db, ADMIN, sender.lastCode(), now))!;

    const rows = await db.select().from(sessions);
    const byUser = (id: string) => rows.find((r) => r.userId === id)!;
    expect(byUser(u.userId).expiresAt.getTime()).toBe(now.getTime() + 30 * 24 * 3600_000);
    expect(byUser(a.userId).expiresAt.getTime()).toBe(now.getTime() + 8 * 3600_000);
    expect(byUser(u.userId).tokenHash).not.toBe(u.sessionToken);

    const plus9h = new Date(now.getTime() + 9 * 3600_000);
    expect(await getSession(db, a.sessionToken, plus9h)).toBeNull();
    expect(await getSession(db, u.sessionToken, plus9h)).not.toBeNull();
  });

  it('revokes a session on logout', async () => {
    const db = await makeTestDb();
    const sender = new FakeSender();
    await requestOtp(db, PHONE, sender);
    const s = (await verifyOtp(db, PHONE, sender.lastCode()))!;
    expect(await getSession(db, s.sessionToken)).not.toBeNull();
    await revokeSession(db, s.sessionToken);
    expect(await getSession(db, s.sessionToken)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const db = await makeTestDb();
    expect(await getSession(db, 'nope')).toBeNull();
  });
});

describe('admin TOTP (SEG-04)', () => {
  const now = new Date('2026-01-01T12:00:10Z');
  async function setup() {
    const db = await makeTestDb();
    const [admin] = await db
      .insert(users)
      .values({ phone: '+50760000001', role: 'admin' })
      .returning();
    return { db, admin };
  }

  it('enrolls and returns a base32 secret and otpauth URL', async () => {
    const { db, admin } = await setup();
    const { secret, otpauthUrl } = await enrollTotp(db, admin.id);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain(`secret=${secret}`);
  });

  it('accepts current and previous window, rejects older and far-future', async () => {
    const { db, admin } = await setup();
    const { secret } = await enrollTotp(db, admin.id);
    const t = now.getTime();
    expect(await verifyTotp(db, admin.id, totpAt(secret, t), now)).toBe(true);
    expect(await verifyTotp(db, admin.id, totpAt(secret, t - 30_000), now)).toBe(true);
    expect(await verifyTotp(db, admin.id, totpAt(secret, t - 90_000), now)).toBe(false);
    expect(await verifyTotp(db, admin.id, totpAt(secret, t + 90_000), now)).toBe(false);
    expect(await verifyTotp(db, admin.id, 'abc', now)).toBe(false);
  });

  it('matches the RFC 6238 SHA-1 test vector', async () => {
    const { db, admin } = await setup();
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ASCII "12345678901234567890"
    await db.update(users).set({ totpSecret: secret }).where(eq(users.id, admin.id));
    expect(await verifyTotp(db, admin.id, '287082', new Date(59_000))).toBe(true);
  });

  it('is false when the admin has not enrolled', async () => {
    const { db, admin } = await setup();
    expect(await verifyTotp(db, admin.id, '123456', now)).toBe(false);
  });

  it('completeMfa sets mfa on an admin session with a valid code only', async () => {
    const { db, admin } = await setup();
    const { secret } = await enrollTotp(db, admin.id);
    const sender = new FakeSender();
    await requestOtp(db, '+50760000001', sender, now);
    const s = (await verifyOtp(db, '+50760000001', sender.lastCode(), now))!;
    expect((await getSession(db, s.sessionToken, now))!.mfa).toBe(false);
    expect(await completeMfa(db, s.sessionToken, '000000', now)).toBe(false);
    expect((await getSession(db, s.sessionToken, now))!.mfa).toBe(false);
    expect(await completeMfa(db, s.sessionToken, totpAt(secret, now.getTime()), now)).toBe(true);
    expect((await getSession(db, s.sessionToken, now))!.mfa).toBe(true);
  });

  it('completeMfa is false for non-admin sessions and unknown tokens', async () => {
    const db = await makeTestDb();
    const sender = new FakeSender();
    await requestOtp(db, PHONE, sender, now);
    const s = (await verifyOtp(db, PHONE, sender.lastCode(), now))!;
    expect(await completeMfa(db, s.sessionToken, '123456', now)).toBe(false);
    expect(await completeMfa(db, 'nope', '123456', now)).toBe(false);
  });
});
