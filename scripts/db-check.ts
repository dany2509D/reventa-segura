// Usage: npm run db:check
// Read-only check of the database in DATABASE_URL: server, role, tables created by the migrations,
// users row count and Row Level Security per public table. Prints no secrets.
import './load-env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { formatDbCheck, inspectDatabase } from '../src/lib/db/check';
import { buildPgConfig, describeDatabaseTarget, scriptErrorText } from '../src/lib/db/pg-config';
import * as schema from '../src/lib/db/schema';
import type { Db } from '../src/lib/db/types';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL no está configurada (.env.local). db:check revisa la base de datos remota (Supabase).');
  process.exit(1);
}

const target = describeDatabaseTarget(url);
console.log(`Conectando a ${target} …`);
let exitCode = 0;
let pool: Pool | null = null;
try {
  pool = new Pool({ ...buildPgConfig(process.env), max: 1 });
  const report = await inspectDatabase(drizzle(pool, { schema }) as unknown as Db);
  const { text, ok } = formatDbCheck(report, target);
  console.log(text);
  if (!ok) exitCode = 1;
} catch (e) {
  console.error(`No se pudo revisar la base de datos: ${scriptErrorText(e, url)}`);
  exitCode = 1;
} finally {
  await pool?.end();
}
process.exit(exitCode);
