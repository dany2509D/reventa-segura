// Usage: npm run db:migrate
// Applies pending migrations to the database in DATABASE_URL_MIGRATE (direct or session-pooler
// connection) or, when unset, DATABASE_URL. Refuses to run without either: it would otherwise
// migrate the throwaway local PGlite database and look like a success.
import './load-env';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildPgConfig, describeDatabaseTarget, resolveMigrationUrl, scriptErrorText } from '../src/lib/db/pg-config';

const url = resolveMigrationUrl(process.env);
if (!url) {
  console.error('No hay base de datos configurada: define DATABASE_URL (y opcionalmente DATABASE_URL_MIGRATE) en .env.local.');
  console.error('La base local de desarrollo (PGlite) se migra sola al iniciar "npm run dev".');
  process.exit(1);
}

console.log(`Aplicando migraciones en ${describeDatabaseTarget(url)} …`);
let exitCode = 0;
let pool: Pool | null = null;
try {
  // One connection, no statement timeout: a migration may legitimately take longer than a request.
  pool = new Pool({ ...buildPgConfig({ ...process.env, DATABASE_URL: url }), max: 1, statement_timeout: undefined });
  await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), 'drizzle') });
  console.log('Migraciones aplicadas.');
} catch (e) {
  console.error(`No se pudieron aplicar las migraciones: ${scriptErrorText(e, url)}`);
  exitCode = 1;
} finally {
  await pool?.end();
}
process.exit(exitCode);
