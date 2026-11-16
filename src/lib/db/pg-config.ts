import type { PoolConfig } from 'pg';

/*
 * Postgres connection settings (Supabase or any hosted Postgres), as a pure function of the
 * environment so the security rules are unit-tested:
 *  - localhost / 127.0.0.1 / ::1 → plain TCP (same machine, nothing to intercept).
 *  - any other host → TLS with certificate verification against DATABASE_CA_CERT. Supabase's
 *    chain is not in Node's default store, so without the CA there is no verified connection.
 *    Outside production only, DATABASE_SSL_INSECURE=1 is an explicit opt-in to an encrypted but
 *    unverified connection for local testing. Production ignores it and refuses to start.
 *  - ssl* query parameters are removed from the URL: pg merges the parsed URL over this config,
 *    so `?sslmode=require` would otherwise replace the CA settings.
 * Error messages never include the URL (it carries the password).
 */

export type DbEnv = Readonly<Record<string, string | undefined>>;

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const POOL_MAX_DEFAULT = 5;
const POOL_MAX_LIMIT = 50;
const STATEMENT_TIMEOUT_DEFAULT_MS = 30_000;

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DatabaseConfigError('DATABASE_URL is not a valid URL (expected postgresql://user:password@host:port/database).');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new DatabaseConfigError('DATABASE_URL must start with postgresql:// or postgres://.');
  }
  return url;
}

// Removes every ssl* / uselibpqcompat parameter; returns the original string when there is none
// (so an already percent-encoded password is passed through byte for byte).
function stripSslParams(raw: string, url: URL): string {
  const drop = [...url.searchParams.keys()].filter((k) => /^ssl/i.test(k) || k.toLowerCase() === 'uselibpqcompat');
  if (drop.length === 0) return raw;
  for (const k of new Set(drop)) url.searchParams.delete(k);
  return url.toString();
}

function isLocalHost(url: URL): boolean {
  const host = url.searchParams.get('host') ?? url.hostname;
  return LOCAL_HOSTS.has(host.toLowerCase()) || host.startsWith('/');
}

function readCaCert(env: DbEnv): string | null {
  const raw = env.DATABASE_CA_CERT?.trim();
  if (!raw) return null;
  const pem = raw.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim();
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) {
    throw new DatabaseConfigError(
      'DATABASE_CA_CERT must be the PEM text of the CA certificate (-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----), not a file path.',
    );
  }
  return pem;
}

function sslFor(url: URL, env: DbEnv): PoolConfig['ssl'] {
  if (isLocalHost(url)) return false;
  const ca = readCaCert(env);
  if (ca) return { ca, rejectUnauthorized: true };
  const production = env.NODE_ENV === 'production';
  if (!production && env.DATABASE_SSL_INSECURE === '1') return { rejectUnauthorized: false };
  const hint = production
    ? env.DATABASE_SSL_INSECURE
      ? ' DATABASE_SSL_INSECURE is ignored in production.'
      : ''
    : ' For local testing only you may set DATABASE_SSL_INSECURE=1 (encrypted but unverified).';
  throw new DatabaseConfigError(
    `DATABASE_CA_CERT is required for a remote database: set it to the PEM text of your provider's CA certificate (Supabase: Database settings → SSL Configuration → Download certificate).${hint}`,
  );
}

function intFromEnv(env: DbEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new DatabaseConfigError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

export function buildPgConfig(env: DbEnv = process.env): PoolConfig {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new DatabaseConfigError('DATABASE_URL is not set.');
  const url = parseUrl(raw);
  const ssl = sslFor(url, env);
  const statementTimeout = intFromEnv(env, 'DATABASE_STATEMENT_TIMEOUT_MS', STATEMENT_TIMEOUT_DEFAULT_MS, 0, 600_000);
  return {
    connectionString: stripSslParams(raw, url),
    ssl,
    max: intFromEnv(env, 'DATABASE_POOL_MAX', POOL_MAX_DEFAULT, 1, POOL_MAX_LIMIT),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Sent as a startup parameter (server-side timeout). 0 = do not send it, for a pooler that
    // rejects unknown startup parameters.
    ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
  };
}

/** `user@host:port/database` for logs and script output: never the password or query string. */
export function describeDatabaseTarget(raw: string): string {
  try {
    const url = new URL(raw);
    const user = decodeURIComponent(url.username);
    const port = url.port || '5432';
    return `${user ? `${user}@` : ''}${url.hostname}:${port}${url.pathname}`;
  } catch {
    return '(URL inválida)';
  }
}

/** Replaces the URL's password (decoded and percent-encoded forms) in `text` with ***. */
export function redactPassword(text: string, raw: string | null | undefined): string {
  let password: string;
  try {
    password = new URL(raw ?? '').password;
  } catch {
    return text;
  }
  let out = text;
  for (const secret of new Set([password, safeDecode(password)])) {
    if (secret) out = out.split(secret).join('***');
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * For the db scripts only (the owner needs the real reason: TLS, password, DNS…): the error and
 * its `cause` chain (drizzle wraps driver errors), with codes, password redacted. Not for request
 * handlers: drizzle messages can carry bound parameters.
 */
export function scriptErrorText(e: unknown, url: string | null | undefined): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; cur !== undefined && cur !== null && depth < 4; depth++) {
    if (cur instanceof Error) {
      const code = (cur as { code?: unknown }).code;
      parts.push(`${cur.message.trim()}${typeof code === 'string' ? ` [${code}]` : ''}`);
      cur = cur.cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return redactPassword(parts.join(' ← causa: '), url);
}

/** Migrations go through the direct/session connection when one is configured. */
export function resolveMigrationUrl(env: DbEnv = process.env): string | null {
  return env.DATABASE_URL_MIGRATE?.trim() || env.DATABASE_URL?.trim() || null;
}
