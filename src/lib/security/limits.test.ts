import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { LIMITS, limitKey, limitOr429 } from './limits';

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

const T0 = new Date('2027-01-01T12:00:00Z');
const rule = { name: 'unit', limit: 2, windowSeconds: 60 };

describe('limitOr429', () => {
  it('returns null while under the limit, then a Spanish 429 with Retry-After', async () => {
    expect(await limitOr429(db, rule, 'u1', T0)).toBeNull();
    expect(await limitOr429(db, rule, 'u1', T0)).toBeNull();
    const res = await limitOr429(db, rule, 'u1', new Date(T0.getTime() + 10_000));
    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBe('50');
    expect(res?.headers.get('cache-control')).toBe('no-store');
    expect(await res?.json()).toEqual({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
  });

  it('keeps subjects and rules independent', async () => {
    await limitOr429(db, rule, 'u1', T0);
    await limitOr429(db, rule, 'u1', T0);
    expect((await limitOr429(db, rule, 'u1', T0))?.status).toBe(429);
    expect(await limitOr429(db, rule, 'u2', T0)).toBeNull();
    expect(await limitOr429(db, { ...rule, name: 'other' }, 'u1', T0)).toBeNull();
  });

  it('limitKey namespaces by rule', () => {
    expect(limitKey(rule, 'abc')).toBe('unit:abc');
  });
});

describe('LIMITS (SEG-07)', () => {
  it('has the agreed budgets', () => {
    const HOUR = 3600;
    const DAY = 24 * HOUR;
    expect(LIMITS.otpRequestIp).toMatchObject({ limit: 20, windowSeconds: HOUR });
    expect(LIMITS.otpVerifyIp).toMatchObject({ limit: 30, windowSeconds: 15 * 60 });
    expect(LIMITS.listingCreate).toMatchObject({ limit: 10, windowSeconds: HOUR });
    expect(LIMITS.listingWithdraw).toMatchObject({ limit: 30, windowSeconds: HOUR });
    expect(LIMITS.checkout).toMatchObject({ limit: 20, windowSeconds: HOUR });
    expect(LIMITS.identity).toMatchObject({ limit: 5, windowSeconds: DAY });
    expect(LIMITS.orderReceived).toMatchObject({ limit: 20, windowSeconds: HOUR });
    expect(LIMITS.orderEntry).toMatchObject({ limit: 20, windowSeconds: HOUR });
    expect(LIMITS.orderProof).toMatchObject({ limit: 20, windowSeconds: HOUR });
    expect(LIMITS.orderDispute).toMatchObject({ limit: 5, windowSeconds: DAY });
    const names = Object.values(LIMITS).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
