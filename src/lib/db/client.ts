import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildPgConfig } from './pg-config';
import * as schema from './schema';
import type { Db } from './types';

export { DatabaseConfigError, buildPgConfig, describeDatabaseTarget, resolveMigrationUrl } from './pg-config';

/*
 * One database per process.
 *  - DATABASE_URL set → Postgres (Supabase or any) through a small pg pool configured by
 *    buildPgConfig (verified TLS, timeouts). Interactive transactions, SELECT ... FOR UPDATE and
 *    pg_advisory_xact_lock are required by the money flows, so use a TCP connection string
 *    (Supabase session pooler, or transaction pooler: drizzle sends only unnamed statements and
 *    every transaction runs on one pooled client), never an HTTP-only driver.
 *  - otherwise, outside production → PGlite: persisted under .data/pglite when running the dev
 *    server, in memory under tests. In production a missing DATABASE_URL is a hard error: money
 *    must never be recorded in a throwaway database.
 * Every consumer depends only on the driver-agnostic `Db` type.
 */

type DbGlobals = { __db?: Db; __dbMigrate?: () => Promise<void> };
const g = globalThis as unknown as DbGlobals;

const MIGRATIONS = { migrationsFolder: join(process.cwd(), 'drizzle') };

export function createClient(dataDir?: string): Db {
  return drizzlePglite(new PGlite(dataDir), { schema });
}

function open(): void {
  if (process.env.DATABASE_URL) {
    const pool = new Pool(buildPgConfig(process.env));
    // An idle pooled connection dropped by the server/pooler emits 'error' on the pool; unhandled,
    // it would crash the process. Log the kind only (messages may carry query parameters).
    pool.on('error', (e: Error & { code?: string }) => console.error('db pool error', e.code ?? e.name));
    const db = drizzlePg(pool, { schema });
    g.__db = db as unknown as Db;
    g.__dbMigrate = () => migratePg(db, MIGRATIONS);
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }
  const dir = process.env.PGLITE_DATA_DIR || (process.env.NODE_ENV === 'test' ? undefined : join(process.cwd(), '.data', 'pglite'));
  if (dir) mkdirSync(dir, { recursive: true }); // PGlite does not create missing parent folders
  const db = drizzlePglite(new PGlite(dir), { schema });
  g.__db = db as unknown as Db;
  g.__dbMigrate = () => migratePglite(db, MIGRATIONS);
}

// Process-wide singleton for route handlers (survives dev hot reloads).
export function getDb(): Db {
  if (!g.__db) open();
  return g.__db!;
}

/** Applies pending migrations (idempotent: drizzle keeps its own journal table). */
export async function migrateDb(): Promise<void> {
  getDb();
  await g.__dbMigrate!();
}
