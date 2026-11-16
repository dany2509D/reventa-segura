import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Next.js can render a page WITHOUT re-running its layout (a client that already holds the layout
 * segment asks only for the page), so a check that lives only in the layout is not a gate. Every
 * admin page must gate itself, and every server action must too. Structural guard: a new admin page
 * or action that forgets it fails here.
 */

const PANEL = join(process.cwd(), 'src', 'app', 'admin', '(panel)');

function files(dir: string, name: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return files(full, name);
    return name.test(e.name) ? [full] : [];
  });
}

describe('admin pages gate themselves (not only the layout)', () => {
  const pages = files(PANEL, /^page\.tsx$/);

  it('finds the admin pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  it.each(pages)('%s awaits requireAdminPage() before reading anything', (file) => {
    const src = readFileSync(file, 'utf8');
    const gate = src.indexOf('await requireAdminPage()');
    expect(gate, 'requireAdminPage() is not awaited').toBeGreaterThan(-1);
    for (const read of ['getDb()', 'await searchParams']) {
      const at = src.indexOf(read, src.indexOf('export default async function'));
      if (at > -1) expect(gate, `${read} is used before the gate`).toBeLessThan(at);
    }
  });

  it('the server actions run requireAdminPage() inside run()', () => {
    const src = readFileSync(join(PANEL, 'actions.ts'), 'utf8');
    expect(src).toMatch(/async function run\([\s\S]*?await requireAdminPage\(\)/);
    // every exported action goes through run()
    for (const m of src.matchAll(/export async function (\w+Action)\(fd: FormData\) \{\r?\n\s*await run\(/g)) expect(m[1]).toBeTruthy();
    const exported = [...src.matchAll(/export async function (\w+Action)/g)].length;
    const viaRun = [...src.matchAll(/export async function \w+Action\(fd: FormData\) \{\r?\n\s*await run\(/g)].length;
    expect(viaRun).toBe(exported);
  });
});
