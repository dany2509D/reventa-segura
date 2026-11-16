import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './test-db';
import type { Db } from './types';
import { users } from './schema';
import { expectedTableNames, formatDbCheck, inspectDatabase, type DbCheckReport } from './check';

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});

describe('expectedTableNames', () => {
  it('reads every table from the drizzle schema (not a hardcoded list)', () => {
    const names = expectedTableNames();
    expect(names).toContain('users');
    expect(names).toContain('ledger_entries');
    expect(names).toContain('rate_limit_hits');
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort());
  });
});

describe('inspectDatabase', () => {
  it('reports server, user, tables, users row count and RLS state per public table', async () => {
    await db.insert(users).values([{ phone: '+50761111111' }, { phone: '+50762222222' }]);
    const r = await inspectDatabase(db);
    expect(r.serverVersion).toMatch(/PostgreSQL/);
    expect(r.currentUser).toBeTruthy();
    expect(r.tables.every((t) => t.exists)).toBe(true);
    expect(r.tables.map((t) => t.name)).toEqual(expectedTableNames());
    expect(r.usersCount).toBe(2);
    expect(r.rls.map((t) => t.table).sort()).toEqual(expectedTableNames());
    expect(r.rls.every((t) => !t.enabled)).toBe(true); // migrations do not enable RLS (yet)
  });

  it('sees RLS once it is enabled on a table', async () => {
    await db.execute(sql`alter table app_config enable row level security`);
    const r = await inspectDatabase(db);
    expect(r.rls.find((t) => t.table === 'app_config')?.enabled).toBe(true);
    expect(r.rls.find((t) => t.table === 'users')?.enabled).toBe(false);
  });

  it('flags a missing expected table and does not fail when users is absent', async () => {
    const r = await inspectDatabase(db, ['ghost_table', 'users']);
    expect(r.tables).toEqual([
      { name: 'ghost_table', exists: false },
      { name: 'users', exists: true },
    ]);
    const empty = await inspectDatabase(await makeTestDbWithoutUsers(), ['users']);
    expect(empty.usersCount).toBeNull();
  });
});

async function makeTestDbWithoutUsers(): Promise<Db> {
  const fresh = await makeTestDb();
  await fresh.execute(sql`drop table users cascade`);
  return fresh;
}

describe('formatDbCheck', () => {
  const report: DbCheckReport = {
    serverVersion: 'PostgreSQL 17.4 on aarch64',
    currentUser: 'postgres',
    statementTimeout: '30s',
    tables: [
      { name: 'orders', exists: true },
      { name: 'users', exists: false },
    ],
    usersCount: null,
    rls: [
      { table: 'orders', enabled: false },
      { table: 'payouts', enabled: true },
    ],
  };
  const target = 'postgres.ref@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

  it('lists missing tables and the tables with RLS disabled, with the reason, and says whether it is ok', () => {
    const { text, ok } = formatDbCheck(report, target);
    expect(ok).toBe(false); // a missing table means migrations did not run
    expect(text).toContain(target);
    expect(text).toContain('PostgreSQL 17.4');
    expect(text).toMatch(/FALTA.*users/);
    expect(text).toMatch(/ADVERTENCIA/);
    expect(text).toMatch(/orders/);
    const warning = text.slice(text.indexOf('ADVERTENCIA'));
    expect(warning).not.toMatch(/payouts/);
    expect(warning).toMatch(/API/); // Supabase exposes `public` through its REST API
    expect(warning).toMatch(/migración/);
  });

  it('is ok with every table present, and has no RLS warning when RLS is enabled everywhere', () => {
    const { text, ok } = formatDbCheck(
      { ...report, tables: report.tables.map((t) => ({ ...t, exists: true })), usersCount: 3, rls: report.rls.map((t) => ({ ...t, enabled: true })) },
      target,
    );
    expect(ok).toBe(true);
    expect(text).not.toMatch(/ADVERTENCIA/);
    expect(text).toMatch(/users.*3/);
  });
});
