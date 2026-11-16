import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { DatabaseConfigError, buildPgConfig, describeDatabaseTarget, redactPassword, resolveMigrationUrl, scriptErrorText } from './pg-config';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIBADANBgkqhkiG9w0BAQsFADA=\n-----END CERTIFICATE-----';
const SUPABASE_URL = 'postgresql://postgres.abcdefghij:s3cr3t-pass@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

describe('buildPgConfig: SSL rules', () => {
  it.each([
    ['localhost', 'postgres://app:pw@localhost:5432/app'],
    ['127.0.0.1', 'postgres://app:pw@127.0.0.1:5432/app'],
    ['::1', 'postgres://app:pw@[::1]:5432/app'],
  ])('%s → no SSL', (_host, url) => {
    expect(buildPgConfig({ DATABASE_URL: url, NODE_ENV: 'development' }).ssl).toBe(false);
  });

  it('local host in production still uses no SSL (same machine, nothing to intercept)', () => {
    expect(buildPgConfig({ DATABASE_URL: 'postgres://app:pw@localhost/app', NODE_ENV: 'production' }).ssl).toBe(false);
  });

  it('remote host with DATABASE_CA_CERT → TLS with certificate verification against that CA', () => {
    const cfg = buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: PEM, NODE_ENV: 'production' });
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('remote host with a CA keeps verification ON even when DATABASE_SSL_INSECURE=1 (development)', () => {
    const cfg = buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: PEM, DATABASE_SSL_INSECURE: '1', NODE_ENV: 'development' });
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it.each([undefined, 'development', 'test'])('remote host without a CA outside production (NODE_ENV=%s) → clear error naming DATABASE_CA_CERT', (nodeEnv) => {
    expect(() => buildPgConfig({ DATABASE_URL: SUPABASE_URL, NODE_ENV: nodeEnv })).toThrow(DatabaseConfigError);
    expect(() => buildPgConfig({ DATABASE_URL: SUPABASE_URL, NODE_ENV: nodeEnv })).toThrow(/DATABASE_CA_CERT/);
  });

  it('remote host without a CA outside production with DATABASE_SSL_INSECURE=1 → TLS without verification (explicit opt-in)', () => {
    const cfg = buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_SSL_INSECURE: '1', NODE_ENV: 'development' });
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  it.each(['true', 'yes', '0', ''])('DATABASE_SSL_INSECURE=%j is not an opt-in (only "1" is)', (v) => {
    expect(() => buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_SSL_INSECURE: v, NODE_ENV: 'development' })).toThrow(/DATABASE_CA_CERT/);
  });

  it('production ignores DATABASE_SSL_INSECURE and refuses to connect without a CA', () => {
    const env = { DATABASE_URL: SUPABASE_URL, DATABASE_SSL_INSECURE: '1', NODE_ENV: 'production' };
    expect(() => buildPgConfig(env)).toThrow(DatabaseConfigError);
    expect(() => buildPgConfig(env)).toThrow(/DATABASE_CA_CERT/);
    expect(() => buildPgConfig(env)).toThrow(/DATABASE_SSL_INSECURE is ignored in production/);
  });

  it('error messages never contain the password or the full URL', () => {
    try {
      buildPgConfig({ DATABASE_URL: SUPABASE_URL, NODE_ENV: 'production' });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('s3cr3t');
      expect(String((e as Error).message)).not.toContain('postgres.abcdefghij');
    }
  });
});

describe('buildPgConfig: DATABASE_CA_CERT parsing', () => {
  it('turns literal \\n escapes (one-line env values) into real newlines', () => {
    const oneLine = PEM.replace(/\n/g, '\\n');
    const cfg = buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: oneLine });
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('accepts Windows line endings and surrounding whitespace', () => {
    const cfg = buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: `  ${PEM.replace(/\n/g, '\r\n')}\r\n` });
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('rejects a value that is not a PEM certificate (e.g. a pasted file path or key)', () => {
    expect(() => buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: 'C:/certs/prod-ca-2021.crt' })).toThrow(/PEM/);
  });

  it('a blank DATABASE_CA_CERT counts as missing', () => {
    expect(() => buildPgConfig({ DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: '   ', NODE_ENV: 'production' })).toThrow(/DATABASE_CA_CERT/);
  });
});

describe('buildPgConfig: connection string', () => {
  it.each([
    ['sslmode=require', `${SUPABASE_URL}?sslmode=require`],
    ['sslmode=verify-full + sslrootcert', `${SUPABASE_URL}?sslmode=verify-full&sslrootcert=/tmp/ca.crt`],
    ['ssl=true', `${SUPABASE_URL}?ssl=true`],
    ['uselibpqcompat', `${SUPABASE_URL}?uselibpqcompat=true&sslmode=require`],
  ])('strips %s so pg-connection-string cannot override the SSL config', (_name, url) => {
    const cfg = buildPgConfig({ DATABASE_URL: url, DATABASE_CA_CERT: PEM });
    expect(cfg.connectionString).toBe(SUPABASE_URL);
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('keeps unrelated query parameters', () => {
    const cfg = buildPgConfig({ DATABASE_URL: `${SUPABASE_URL}?sslmode=require&application_name=reventa`, DATABASE_CA_CERT: PEM });
    expect(cfg.connectionString).toBe(`${SUPABASE_URL}?application_name=reventa`);
  });

  it('what node-postgres finally uses keeps verification ON (the parsed URL would otherwise win)', () => {
    type Params = { ssl: unknown; statement_timeout: unknown; password: string; host: string; port: number };
    const params = (cfg: object) => (new Client(cfg) as unknown as { connectionParameters: Params }).connectionParameters;
    const url = `${SUPABASE_URL}?sslmode=require`;
    // Control: handing pg the raw URL lets `sslmode=require` replace our CA settings with `{}`.
    expect(params({ connectionString: url, ssl: { ca: PEM, rejectUnauthorized: true } }).ssl).toEqual({});
    const p = params(buildPgConfig({ DATABASE_URL: url, DATABASE_CA_CERT: PEM }));
    expect(p.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(p.statement_timeout).toBe(30_000);
    expect(p.password).toBe('s3cr3t-pass');
    expect([p.host, p.port]).toEqual(['aws-0-sa-east-1.pooler.supabase.com', 5432]);
  });

  it('leaves a URL without SSL parameters untouched (including percent-encoded passwords)', () => {
    const url = 'postgresql://postgres.ref:p%40ss%23word@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
    expect(buildPgConfig({ DATABASE_URL: url, DATABASE_CA_CERT: PEM }).connectionString).toBe(url);
  });

  it('requires DATABASE_URL', () => {
    expect(() => buildPgConfig({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => buildPgConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-Postgres or malformed URL without echoing it', () => {
    for (const url of ['https://example.com/db', 'not a url with s3cr3t']) {
      try {
        buildPgConfig({ DATABASE_URL: url });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(DatabaseConfigError);
        expect((e as Error).message).not.toContain('s3cr3t');
      }
    }
  });
});

describe('buildPgConfig: pool options', () => {
  const base = { DATABASE_URL: SUPABASE_URL, DATABASE_CA_CERT: PEM };

  it('small pool with idle, connect and statement timeouts', () => {
    const cfg = buildPgConfig(base);
    expect(cfg.max).toBe(5);
    expect(cfg.idleTimeoutMillis).toBe(30_000);
    expect(cfg.connectionTimeoutMillis).toBe(10_000);
    expect(cfg.statement_timeout).toBe(30_000);
  });

  it('DATABASE_POOL_MAX overrides the pool size', () => {
    expect(buildPgConfig({ ...base, DATABASE_POOL_MAX: '2' }).max).toBe(2);
  });

  it.each(['0', '-1', 'abc', '1.5', '1000'])('rejects a nonsensical DATABASE_POOL_MAX (%s)', (v) => {
    expect(() => buildPgConfig({ ...base, DATABASE_POOL_MAX: v })).toThrow(/DATABASE_POOL_MAX/);
  });

  it('DATABASE_STATEMENT_TIMEOUT_MS=0 stops sending the startup parameter (for poolers that reject it)', () => {
    expect(buildPgConfig({ ...base, DATABASE_STATEMENT_TIMEOUT_MS: '0' }).statement_timeout).toBeUndefined();
    expect(buildPgConfig({ ...base, DATABASE_STATEMENT_TIMEOUT_MS: '5000' }).statement_timeout).toBe(5000);
    expect(() => buildPgConfig({ ...base, DATABASE_STATEMENT_TIMEOUT_MS: 'x' })).toThrow(/DATABASE_STATEMENT_TIMEOUT_MS/);
  });
});

describe('describeDatabaseTarget', () => {
  it('shows user, host, port and database but never the password', () => {
    const s = describeDatabaseTarget(`${SUPABASE_URL}?sslmode=require`);
    expect(s).toBe('postgres.abcdefghij@aws-0-sa-east-1.pooler.supabase.com:5432/postgres');
    expect(s).not.toContain('s3cr3t');
  });

  it('never echoes a malformed URL', () => {
    expect(describeDatabaseTarget('garbage s3cr3t')).toBe('(URL inválida)');
  });
});

describe('redactPassword', () => {
  it('removes the password (raw and percent-encoded) from any text, e.g. a driver error', () => {
    const url = 'postgresql://postgres.ref:p%40ss%23w0rd@host.example.com:5432/postgres';
    expect(redactPassword('failed for p@ss#w0rd and p%40ss%23w0rd', url)).toBe('failed for *** and ***');
  });
  it('returns the text unchanged when there is no URL or password', () => {
    expect(redactPassword('boom', undefined)).toBe('boom');
    expect(redactPassword('boom', 'postgres://u@h/d')).toBe('boom');
  });
});

describe('scriptErrorText', () => {
  it('includes the driver cause behind drizzle "Failed query" wrappers, with its code, and redacts the password', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND host for pw p%40ss'), { code: 'ENOTFOUND' });
    const e = new Error('Failed query: select 1\nparams: ', { cause });
    const text = scriptErrorText(e, 'postgresql://u:p%40ss@host.example.com/db');
    expect(text).toContain('Failed query: select 1');
    expect(text).toContain('ENOTFOUND');
    expect(text).not.toContain('p%40ss');
    expect(text).not.toContain('p@ss');
  });
  it('handles non-Error values', () => {
    expect(scriptErrorText('boom', null)).toBe('boom');
  });
});

describe('resolveMigrationUrl', () => {
  it('prefers DATABASE_URL_MIGRATE (direct / session connection) over DATABASE_URL', () => {
    expect(resolveMigrationUrl({ DATABASE_URL: 'postgres://a@h:6543/d', DATABASE_URL_MIGRATE: 'postgres://a@h:5432/d' })).toBe('postgres://a@h:5432/d');
  });
  it('falls back to DATABASE_URL', () => {
    expect(resolveMigrationUrl({ DATABASE_URL: 'postgres://a@h:6543/d', DATABASE_URL_MIGRATE: '' })).toBe('postgres://a@h:6543/d');
  });
  it('is null when neither is set (the script must refuse: it would migrate the local PGlite)', () => {
    expect(resolveMigrationUrl({ DATABASE_URL: ' ', DATABASE_URL_MIGRATE: undefined })).toBeNull();
  });
});
