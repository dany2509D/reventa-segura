import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { rateLimit } from './rate-limit';

let db: Db;
const T0 = new Date('2027-01-01T12:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

beforeEach(async () => {
  db = await makeTestDb();
});

describe('rateLimit', () => {
  it('allows `limit` calls in the window and denies the next with a positive retry delay', async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit(db, 'k', 3, 60, at(i))).allowed).toBe(true);
    const denied = await rateLimit(db, 'k', 3, 60, at(3));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(57); // the first hit (t=0) leaves the 60 s window at t=60
  });

  it('allows again once the oldest hits have left the window', async () => {
    for (let i = 0; i < 3; i++) await rateLimit(db, 'k', 3, 60, at(i));
    expect((await rateLimit(db, 'k', 3, 60, at(30))).allowed).toBe(false);
    // t=61: the hit at t=0 expired, but the denied attempt at t=30 and t=3.. still count; window is sliding
    expect((await rateLimit(db, 'k', 3, 60, at(200))).allowed).toBe(true);
  });

  it('keeps keys independent', async () => {
    for (let i = 0; i < 3; i++) await rateLimit(db, 'a', 3, 60, at(i));
    expect((await rateLimit(db, 'a', 3, 60, at(4))).allowed).toBe(false);
    expect((await rateLimit(db, 'b', 3, 60, at(4))).allowed).toBe(true);
  });

  it('under concurrency exactly `limit` of many parallel calls are allowed', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => rateLimit(db, 'burst', 5, 60, T0)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(7);
  });

  it.each([0, -1, 1.5, NaN])('rejects a nonsensical limit (%s)', async (limit) => {
    await expect(rateLimit(db, 'k', limit, 60, T0)).rejects.toThrow(RangeError);
  });
  it.each([0, -5, NaN])('rejects a nonsensical window (%s)', async (w) => {
    await expect(rateLimit(db, 'k', 3, w, T0)).rejects.toThrow(RangeError);
  });
  it('rejects an empty key', async () => {
    await expect(rateLimit(db, '', 3, 60, T0)).rejects.toThrow(RangeError);
  });
});
