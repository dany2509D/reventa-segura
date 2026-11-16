import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingEnvError, REQUIRED_PRODUCTION_ENV, assertProductionEnv } from './env';

const GOOD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db.example/app',
  FILE_URL_SECRET: 'f'.repeat(48),
  CRON_SECRET: 'cron-secret-value',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_token',
};

afterEach(() => vi.unstubAllEnvs());

describe('assertProductionEnv', () => {
  it('requires exactly the production secrets and connection strings', () => {
    expect([...REQUIRED_PRODUCTION_ENV].sort()).toEqual(['BLOB_READ_WRITE_TOKEN', 'CRON_SECRET', 'DATABASE_URL', 'FILE_URL_SECRET']);
  });

  it('passes when everything is set', () => {
    expect(() => assertProductionEnv(GOOD)).not.toThrow();
  });

  it.each(REQUIRED_PRODUCTION_ENV)('fails fast naming %s when it is missing or blank', (name) => {
    for (const value of [undefined, '', '   ']) {
      const env = { ...GOOD, [name]: value };
      let err: unknown;
      try {
        assertProductionEnv(env);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(MissingEnvError);
      expect((err as MissingEnvError).missing).toEqual([name]);
      expect((err as Error).message).toContain(name);
    }
  });

  it('lists every missing variable at once and never echoes a value', () => {
    let err: unknown;
    try {
      assertProductionEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://secret-host/db' });
    } catch (e) {
      err = e;
    }
    expect((err as MissingEnvError).missing).toEqual(['FILE_URL_SECRET', 'CRON_SECRET', 'BLOB_READ_WRITE_TOKEN']);
    expect((err as Error).message).not.toContain('secret-host');
  });

  it('rejects a FILE_URL_SECRET shorter than 32 characters', () => {
    expect(() => assertProductionEnv({ ...GOOD, FILE_URL_SECRET: 'short' })).toThrow(/FILE_URL_SECRET/);
  });

  it('requires FAKE_GATEWAY_SECRET when the test-mode gateway is allowed in production', () => {
    expect(() => assertProductionEnv({ ...GOOD, ALLOW_FAKE_GATEWAY: '1' })).toThrow(/FAKE_GATEWAY_SECRET/);
    expect(() => assertProductionEnv({ ...GOOD, ALLOW_FAKE_GATEWAY: '1', FAKE_GATEWAY_SECRET: 'x' })).not.toThrow();
  });

  it('is skipped outside production and during `next build`', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).not.toThrow();
  });
});

describe('instrumentation register()', () => {
  it('refuses to start a production server with missing variables', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('DATABASE_URL', GOOD.DATABASE_URL);
    vi.stubEnv('FILE_URL_SECRET', '');
    vi.stubEnv('CRON_SECRET', GOOD.CRON_SECRET);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', GOOD.BLOB_READ_WRITE_TOKEN);
    const { register } = await import('@/instrumentation');
    await expect(register()).rejects.toBeInstanceOf(MissingEnvError);
  });

  it('starts when production is fully configured (migrations stay an explicit deploy step)', async () => {
    for (const [k, v] of Object.entries(GOOD)) vi.stubEnv(k, v);
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('AUTO_MIGRATE', '');
    const { register } = await import('@/instrumentation');
    await expect(register()).resolves.toBeUndefined();
  });
});
