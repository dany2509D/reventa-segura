// Test-only: discovers every App Router route handler under src/app/api by walking the directory,
// so the CSRF and authorization tests cannot silently miss a route added later.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export const STATE_CHANGING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export type ApiHandler = { key: string; method: HttpMethod; path: string; handler: Handler };

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

/** '/api/orders/[id]/entry' for every route.ts (or .js) file under src/app/api. */
export function discoverRouteFiles(dir = API_DIR): { path: string; file: string }[] {
  const out: { path: string; file: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...discoverRouteFiles(full));
    else if (/^route\.(ts|js|mjs)$/.test(entry.name)) {
      const rel = relative(API_DIR, dir).split(/[\\/]/).filter(Boolean).join('/');
      out.push({ path: `/api${rel ? `/${rel}` : ''}`, file: full });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Imports each route module and lists its exported HTTP method handlers as 'METHOD /api/...'. */
export async function discoverApiHandlers(): Promise<ApiHandler[]> {
  const handlers: ApiHandler[] = [];
  for (const { path, file } of discoverRouteFiles()) {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const method of HTTP_METHODS) {
      if (typeof mod[method] === 'function') {
        handlers.push({ key: `${method} ${path}`, method, path, handler: mod[method] as Handler });
      }
    }
  }
  return handlers;
}
