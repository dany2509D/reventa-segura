import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Globals = { __db?: unknown; __dbMigrate?: unknown };
const g = globalThis as unknown as Globals;

beforeEach(() => {
  delete g.__db;
  delete g.__dbMigrate;
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete g.__db;
  delete g.__dbMigrate;
});

describe('getDb / migrateDb', () => {
  it('without DATABASE_URL outside production it is an in-memory database, one instance per process', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getDb } = await import('./client');
    expect(getDb()).toBe(getDb());
  });

  it('migrateDb creates the schema, and running it again is a no-op', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getDb, migrateDb } = await import('./client');
    const { users } = await import('./schema');
    await migrateDb();
    await migrateDb();
    const db = getDb();
    await db.insert(users).values({ phone: '+50761234567' });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('refuses to start in production without DATABASE_URL (never a throwaway in-memory database)', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { getDb } = await import('./client');
    expect(() => getDb()).toThrow(/DATABASE_URL/);
  });

  it('with a remote DATABASE_URL builds the pool from buildPgConfig (verified TLS, no network until a query)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres.ref:pw@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require');
    vi.stubEnv('DATABASE_CA_CERT', '-----BEGIN CERTIFICATE-----\\nAAAA\\n-----END CERTIFICATE-----');
    const { getDb } = await import('./client');
    const db = getDb() as unknown as { $client: { options: Record<string, unknown> } };
    expect(db.$client.options.ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----', rejectUnauthorized: true });
    expect(db.$client.options.max).toBe(5);
    expect(db.$client.options.connectionString).not.toContain('sslmode');
  });

  it('refuses a remote DATABASE_URL in production without DATABASE_CA_CERT, even with DATABASE_SSL_INSECURE=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres.ref:pw@aws-0-sa-east-1.pooler.supabase.com:5432/postgres');
    vi.stubEnv('DATABASE_CA_CERT', '');
    vi.stubEnv('DATABASE_SSL_INSECURE', '1');
    const { getDb } = await import('./client');
    expect(() => getDb()).toThrow(/DATABASE_CA_CERT/);
  });

  it('migrateDb applies the append-only triggers (the ledger cannot be edited)', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getDb, migrateDb } = await import('./client');
    const { ledgerEntries, orders, users, events, listings } = await import('./schema');
    await migrateDb();
    const db = getDb();
    const [seller] = await db.insert(users).values({ phone: '+50761111111' }).returning();
    const [buyer] = await db.insert(users).values({ phone: '+50762222222' }).returning();
    const [ev] = await db.insert(events).values({ name: 'E', venue: 'V', lat: 0, lng: 0, radiusM: 100, startsAt: new Date(Date.now() + 1e9), faceValueCents: 1000 }).returning();
    const [l] = await db.insert(listings).values({ sellerId: seller.id, eventId: ev.id, askCents: 1000, deliveryMode: 'file', fingerprint: 'fp', proofPath: 'p' }).returning();
    const [o] = await db.insert(orders).values({ listingId: l.id, buyerId: buyer.id, state: 'creada', priceCents: 1000, feeCents: 100 }).returning();
    const [e] = await db.insert(ledgerEntries).values({ orderId: o.id, kind: 'charge', amountCents: 1000, ref: 'r' }).returning();
    await expect(db.update(ledgerEntries).set({ amountCents: 1 })).rejects.toThrow();
    expect(e.id).toBeTruthy();
  });
});
