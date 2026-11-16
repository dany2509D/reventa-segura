import { count, is, sql, type SQL } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import type { Db } from './types';

/*
 * Read-only health check behind `npm run db:check`: what server and role we reach, whether the
 * migrations created every table, and whether Row Level Security is enabled on each public table
 * (Supabase exposes the `public` schema through its REST API). Never reads or prints secrets.
 */

export type DbCheckReport = {
  serverVersion: string;
  currentUser: string;
  statementTimeout: string;
  tables: { name: string; exists: boolean }[];
  usersCount: number | null;
  rls: { table: string; enabled: boolean }[];
};

/** Table names declared in the drizzle schema, sorted. */
export function expectedTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => getTableConfig(t).name)
    .sort();
}

async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

export async function inspectDatabase(db: Db, expected: string[] = expectedTableNames()): Promise<DbCheckReport> {
  const [{ version }] = await rows<{ version: string }>(db, sql`select version() as version`);
  const [{ user }] = await rows<{ user: string }>(db, sql`select current_user as "user"`);
  const [{ statement_timeout }] = await rows<{ statement_timeout: string }>(db, sql`show statement_timeout`);
  const rls = await rows<{ table: string; enabled: boolean }>(
    db,
    sql`select c.relname as "table", c.relrowsecurity as enabled
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
  );
  const present = new Set(rls.map((r) => r.table));
  const usersCount = present.has('users') ? (await db.select({ n: count() }).from(schema.users))[0].n : null;
  return {
    serverVersion: version,
    currentUser: user,
    statementTimeout: statement_timeout,
    tables: expected.map((name) => ({ name, exists: present.has(name) })),
    usersCount,
    rls: rls.map((r) => ({ table: r.table, enabled: Boolean(r.enabled) })),
  };
}

/** Spanish report for the owner. `ok` is false when a table is missing (migrations not applied). */
export function formatDbCheck(r: DbCheckReport, target: string): { text: string; ok: boolean } {
  const missing = r.tables.filter((t) => !t.exists).map((t) => t.name);
  const noRls = r.rls.filter((t) => !t.enabled).map((t) => t.table);
  const lines = [
    `Base de datos: ${target}`,
    `Servidor: ${r.serverVersion}`,
    `Usuario conectado: ${r.currentUser}`,
    `statement_timeout efectivo: ${r.statementTimeout}`,
    `Tablas esperadas (${r.tables.length}): ${r.tables.length - missing.length} presentes, ${missing.length} faltan`,
    ...missing.map((t) => `  FALTA: ${t}  → ejecuta "npm run db:migrate"`),
    `Filas en users: ${r.usersCount ?? '(la tabla users no existe)'}`,
    'Row Level Security (RLS) en el esquema public:',
    ...r.rls.map((t) => `  ${t.enabled ? 'activado   ' : 'DESACTIVADO'}  ${t.table}`),
  ];
  if (noRls.length > 0) {
    lines.push(
      '',
      `ADVERTENCIA: RLS está DESACTIVADO en ${noRls.length} tabla(s): ${noRls.join(', ')}`,
      '  Supabase publica automáticamente el esquema "public" a través de su API REST (Data API).',
      '  Con RLS desactivado, cualquiera que tenga la clave pública (anon) del proyecto puede leer y',
      '  modificar esas tablas sin pasar por esta aplicación: teléfonos, documentos de identidad, pagos.',
      '  Antes de guardar datos reales hace falta una migración que active RLS en todas estas tablas',
      '  (sin políticas = denegar todo). La app se conecta como dueña de las tablas (postgres) y no se',
      '  ve afectada por RLS.',
    );
  }
  lines.push('', missing.length === 0 ? (noRls.length === 0 ? 'Resultado: OK' : 'Resultado: OK, con advertencias') : 'Resultado: FALTAN TABLAS');
  return { text: lines.join('\n'), ok: missing.length === 0 };
}
