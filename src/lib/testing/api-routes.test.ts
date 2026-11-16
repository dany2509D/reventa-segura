import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverRouteFiles } from './api-routes';

const ROUTE_FILE = /^route\.(tsx?|jsx?|mjs|cjs)$/;

function routeFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? routeFilesUnder(full) : ROUTE_FILE.test(e.name) ? [full] : [];
  });
}

describe('route discovery used by the CSRF and authorization suites', () => {
  it('finds every route handler in src/app, whatever its extension (route.tsx included)', () => {
    const all = routeFilesUnder(join(process.cwd(), 'src', 'app')).sort();
    const found = discoverRouteFiles().map((r) => r.file).sort();
    // A route outside src/app/api (or with another extension) would escape the security suites: fail loudly.
    expect(found).toEqual(all);
  });
});
