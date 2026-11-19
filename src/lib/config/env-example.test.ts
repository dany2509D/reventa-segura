import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_PRODUCTION_ENV } from './env';

// Set by Node, Next.js or the platform, never by us. PORT: the dev server's port comes from the shell
// (Next.js does not read it from .env files); `npm run admin:code` only follows it.
// VERCEL_PROJECT_PRODUCTION_URL: Vercel provides the production domain; SITE_URL overrides it.
const PLATFORM = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'NEXT_PHASE', 'PORT', 'VERCEL_PROJECT_PRODUCTION_URL']);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(full);
    return /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [full] : [];
  });
}

const root = process.cwd();
const files = [...sources(join(root, 'src')), ...sources(join(root, 'scripts')), join(root, 'next.config.ts'), join(root, 'vercel.ts')];
// Reads are `process.env.NAME`, `env.NAME` (functions that take the environment as a parameter) and
// `intFromEnv(env, 'NAME', ...)`-style helpers that take the variable name as a string.
const READ = [/\benv\.([A-Z][A-Z0-9_]*)/g, /\(\s*env,\s*'([A-Z][A-Z0-9_]*)'/g];
const read = new Set(files.flatMap((f) => READ.flatMap((re) => [...readFileSync(f, 'utf8').matchAll(re)].map((m) => m[1]))));
const example = readFileSync(join(root, '.env.example'), 'utf8');
const listed = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe('.env.example', () => {
  it('lists every environment variable the application reads', () => {
    const missing = [...read].filter((v) => !PLATFORM.has(v) && !listed.has(v));
    expect(missing).toEqual([]);
  });

  it('lists nothing the application no longer reads', () => {
    expect([...listed].filter((v) => !read.has(v))).toEqual([]);
  });

  it('marks the variables production refuses to start without', () => {
    for (const name of REQUIRED_PRODUCTION_ENV) {
      expect(example).toMatch(new RegExp(`#[^\\n]*REQUIRED in production[^\\n]*\\n(#[^\\n]*\\n)*${name}=`));
    }
  });
});
