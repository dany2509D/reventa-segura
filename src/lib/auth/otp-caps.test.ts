import { beforeEach, describe, expect, it } from 'vitest';
import { appConfig, otpCodes } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { RateLimitError, SmsCapError } from './errors';
import { DEFAULT_SMS_DAILY_CAP, OTP_MAX_REQUESTS_PER_HOUR, requestOtp, type SmsSender } from './otp';

class CountingSender implements SmsSender {
  sent = 0;
  async send() {
    this.sent++;
  }
}

const NOW = new Date('2027-03-01T12:00:00Z');
const HOUR = 3600_000;
const phone = (i: number) => `+5076${String(i).padStart(7, '0')}`;

let db: Db;
let sender: CountingSender;
beforeEach(async () => {
  db = await makeTestDb();
  sender = new CountingSender();
});

describe('global SMS daily cap (SEG-07, app_config.smsDailyCap)', () => {
  it('defaults to 500', () => {
    expect(DEFAULT_SMS_DAILY_CAP).toBe(500);
  });

  it('refuses the request once the last 24 h already sent `smsDailyCap` codes, without sending', async () => {
    await db.insert(appConfig).values({ key: 'smsDailyCap', value: '2' });
    await requestOtp(db, phone(1), sender, NOW);
    await requestOtp(db, phone(2), sender, NOW);
    await expect(requestOtp(db, phone(3), sender, NOW)).rejects.toBeInstanceOf(SmsCapError);
    expect(sender.sent).toBe(2);
    expect(await db.select().from(otpCodes)).toHaveLength(2);
  });

  it('counts a sliding 24 h window', async () => {
    await db.insert(appConfig).values({ key: 'smsDailyCap', value: '1' });
    await requestOtp(db, phone(1), sender, new Date(NOW.getTime() - 25 * HOUR));
    await requestOtp(db, phone(2), sender, NOW); // the old one left the window
    await expect(requestOtp(db, phone(3), sender, new Date(NOW.getTime() + 23 * HOUR))).rejects.toBeInstanceOf(SmsCapError);
  });

  it('a malformed setting falls back to the default instead of disabling the cap', async () => {
    await db.insert(appConfig).values({ key: 'smsDailyCap', value: 'unlimited' });
    await requestOtp(db, phone(1), sender, NOW);
    expect(sender.sent).toBe(1);
  });

  it('is exact under a parallel burst', async () => {
    await db.insert(appConfig).values({ key: 'smsDailyCap', value: '3' });
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => requestOtp(db, phone(i + 10), sender, NOW)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof SmsCapError)).toHaveLength(5);
    expect(sender.sent).toBe(3);
  });
});

describe('per-phone OTP limit', () => {
  it('is exact under a parallel burst for one phone', async () => {
    const results = await Promise.allSettled(Array.from({ length: 9 }, () => requestOtp(db, phone(1), sender, NOW)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(OTP_MAX_REQUESTS_PER_HOUR);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof RateLimitError)).toHaveLength(
      9 - OTP_MAX_REQUESTS_PER_HOUR,
    );
  });
});
