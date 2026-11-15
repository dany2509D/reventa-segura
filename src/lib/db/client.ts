import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';
import type { Db } from './types';

// Local/dev client backed by PGlite. A Neon (Postgres) driver replaces this in the
// deployment task; every consumer depends only on the driver-agnostic `Db` type.
export function createClient(dataDir?: string): Db {
  return drizzle(new PGlite(dataDir), { schema });
}

const g = globalThis as unknown as { __db?: Db };
// Process-wide singleton for route handlers (survives dev hot reloads).
export function getDb(): Db {
  return (g.__db ??= createClient(process.env.PGLITE_DATA_DIR));
}
