import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/*
 * Runs the real public/sw.js in a sandbox with a fake Cache API and fetch, and checks SEG-18: the
 * worker never stores API responses, tickets, documents or any page; it only caches static assets,
 * and a failed navigation shows the offline page.
 */

const SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

type Handler = (e: unknown) => void;
function boot(online = true) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, unknown>>();
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(new URL(u, 'https://app.test').pathname, { body: `cached:${u}` })),
      put: async (req: { url: string }, res: unknown) => void m.set(new URL(req.url).pathname, res),
      match: async (req: string | { url: string }) => m.get(new URL(typeof req === 'string' ? req : req.url, 'https://app.test').pathname),
    };
  };
  const fetched: string[] = [];
  const sandbox = {
    self: {
      addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
      location: { origin: 'https://app.test' },
    },
    caches: {
      open: async (n: string) => cacheFor(n),
      keys: async () => [...store.keys()],
      delete: async (n: string) => store.delete(n),
      match: async (req: string | { url: string }) => {
        for (const m of store.values()) {
          const hit = m.get(new URL(typeof req === 'string' ? req : req.url, 'https://app.test').pathname);
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: async (req: { url: string }) => {
      fetched.push(new URL(req.url).pathname);
      if (!online) throw new TypeError('offline');
      return { ok: true, clone() { return this; }, body: `net:${req.url}` };
    },
    URL,
    Promise,
  };
  vm.runInNewContext(SOURCE, sandbox);
  const lifecycle = async (type: 'install' | 'activate') => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const request = async (url: string, o: { method?: string; mode?: string } = {}) => {
    let responded: Promise<unknown> | undefined;
    handlers.fetch({
      request: { url: `https://app.test${url}`, method: o.method ?? 'GET', mode: o.mode ?? 'cors' },
      respondWith: (p: Promise<unknown>) => (responded = p),
    });
    return { handled: responded !== undefined, response: responded ? await responded : undefined };
  };
  return { lifecycle, request, store, fetched };
}

describe('public/sw.js', () => {
  it('precaches only the offline page and the icon on install', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    const names = [...sw.store.values()].flatMap((m) => [...m.keys()]);
    expect(names.sort()).toEqual(['/icons/icon-192.png', '/offline.html']);
  });

  it.each([
    '/api/orders/abc/ticket',
    '/api/files/token.sig',
    '/api/auth/verify',
    '/mis-ordenes',
    '/admin/identidades',
    '/eventos/123',
    '/_next/data/build/mis-ordenes.json',
  ])('never intercepts or stores %s (network only)', async (path) => {
    const sw = boot();
    await sw.lifecycle('install');
    const r = await sw.request(path);
    expect(r.handled).toBe(false);
    const names = [...sw.store.values()].flatMap((m) => [...m.keys()]);
    expect(names).not.toContain(path);
  });

  it('ignores non-GET requests entirely', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    expect((await sw.request('/_next/static/app.js', { method: 'POST' })).handled).toBe(false);
  });

  it('caches static build assets on first use and serves them from cache afterwards', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    await sw.request('/_next/static/chunks/app.js');
    expect(sw.fetched).toEqual(['/_next/static/chunks/app.js']);
    await sw.request('/_next/static/chunks/app.js');
    expect(sw.fetched).toEqual(['/_next/static/chunks/app.js']); // second one came from the cache
  });

  it('a navigation goes to the network; offline it shows the cached offline page (and caches nothing else)', async () => {
    const online = boot(true);
    await online.lifecycle('install');
    const ok = await online.request('/mis-ordenes', { mode: 'navigate' });
    expect(ok.handled).toBe(true);
    expect((ok.response as { body: string }).body).toContain('net:');
    expect([...online.store.values()].flatMap((m) => [...m.keys()])).not.toContain('/mis-ordenes');

    const off = boot(false);
    await off.lifecycle('install');
    const page = await off.request('/mis-ordenes', { mode: 'navigate' });
    expect((page.response as { body: string }).body).toBe('cached:/offline.html');
  });

  it('on activate it deletes caches from older versions', async () => {
    const sw = boot();
    sw.store.set('rs-static-v0', new Map());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect([...sw.store.keys()]).not.toContain('rs-static-v0');
  });
});
