import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';
import type { Db } from './types';

/*
 * One database per process.
 *  - DATABASE_URL set → Postgres (Neon or any) through a small pg pool. Interactive transactions
 *    and SELECT ... FOR UPDATE are required by the money flows, so use a pooled TCP connection
 *    string, never an HTTP-only driver.
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
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema });
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
