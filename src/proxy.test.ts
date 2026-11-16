import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import nextConfig from '../next.config';
import { proxy, config } from './proxy';
import { buildCsp, PRIVATE_FILE_CSP, SECURITY_HEADERS } from './lib/security/headers';

afterEach(() => vi.unstubAllEnvs());

/** Directive name → its sources, from a CSP header value. */
function parseCsp(value: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

function expectStrictCsp(value: string | null, nonce?: string) {
  expect(value).toBeTruthy();
  const csp = parseCsp(value!);
  expect(csp.get('default-src')).toEqual(["'self'"]);
  expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
  expect(csp.get('object-src')).toEqual(["'none'"]);
  expect(csp.get('base-uri')).toEqual(["'self'"]);
  expect(csp.get('form-action')).toEqual(["'self'"]);
  expect(csp.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
  expect(csp.get('connect-src')).toEqual(["'self'"]);
  expect(csp.get('worker-src')).toEqual(["'self'"]);
  const script = csp.get('script-src')!;
  expect(script).toContain("'self'");
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain('*');
  if (nonce) expect(script).toEqual(expect.arrayContaining([`'nonce-${nonce}'`, "'strict-dynamic'"]));
  return csp;
}

function expectStaticHeaders(get: (name: string) => string | null | undefined) {
  expect(get('strict-transport-security')).toBe('max-age=63072000; includeSubDomains');
  expect(get('x-content-type-options')).toBe('nosniff');
  expect(get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  expect(get('permissions-policy')).toBe('camera=(self), geolocation=(self), microphone=(), payment=()');
}

const nonceOf = (csp: string) => /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];

describe('proxy (SEG-16)', () => {
  it('sets a strict nonce CSP and the static security headers on the response', () => {
    const res = proxy(new NextRequest('http://localhost/'));
    const csp = res.headers.get('content-security-policy')!;
    const nonce = nonceOf(csp);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{20,}={0,2}$/);
    expectStrictCsp(csp, nonce);
    expectStaticHeaders((n) => res.headers.get(n));
  });

  it('forwards the nonce and the CSP to the renderer as request headers (Next applies the nonce)', () => {
    const res = proxy(new NextRequest('http://localhost/eventos/1', { headers: { 'x-nonce': 'attacker' } }));
    const csp = res.headers.get('content-security-policy')!;
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(csp));
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('uses a fresh nonce for every request', () => {
    const a = nonceOf(proxy(new NextRequest('http://localhost/')).headers.get('content-security-policy')!);
    const b = nonceOf(proxy(new NextRequest('http://localhost/')).headers.get('content-security-policy')!);
    expect(a).not.toBe(b);
  });

  it("allows 'unsafe-eval' only in development (React's dev tooling needs it)", () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(proxy(new NextRequest('http://localhost/')).headers.get('content-security-policy')).toContain("'unsafe-eval'");
    vi.stubEnv('NODE_ENV', 'production');
    expect(proxy(new NextRequest('http://localhost/')).headers.get('content-security-policy')).not.toContain('unsafe-eval');
  });

  it('runs on pages, server actions and public files; skips API routes and build assets (next.config covers them)', () => {
    const [matcher] = config.matcher as string[];
    const re = new RegExp(`^${matcher}$`);
    for (const p of ['/', '/eventos/abc', '/apiario', '/sw.js', '/offline.html', '/admin', '/manifest.webmanifest']) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ['/api/auth/request', '/api/files/tok', '/_next/static/chunks/app.js', '/_next/image', '/favicon.ico']) {
      expect(re.test(p), p).toBe(false);
    }
  });
});

describe('next.config headers for paths the proxy skips', () => {
  it('gives API routes and build assets the same static headers and a nonce-less strict CSP', async () => {
    const rules = await nextConfig.headers!();
    for (const path of ['/api/:path*', '/_next/static/:path*', '/_next/image', '/favicon.ico']) {
      const rule = rules.find((r) => r.source === path);
      expect(rule, path).toBeDefined();
      const get = (n: string) => rule!.headers.find((h) => h.key.toLowerCase() === n)?.value;
      expectStrictCsp(get('content-security-policy') ?? null);
      expectStaticHeaders(get);
    }
  });
});

describe('next.config headers for private files', () => {
  it('keeps the stricter sandbox CSP and no-referrer on the private-file routes (declared after the general rule, so they win)', async () => {
    const rules = await nextConfig.headers!();
    const general = rules.findIndex((r) => r.source === '/api/:path*');
    for (const path of ['/api/files/:token', '/api/orders/:id/ticket']) {
      const i = rules.findIndex((r) => r.source === path);
      expect(i, path).toBeGreaterThan(general);
      const get = (n: string) => rules[i].headers.find((h) => h.key.toLowerCase() === n)?.value;
      expect(get('content-security-policy')).toBe(PRIVATE_FILE_CSP);
      expect(get('referrer-policy')).toBe('no-referrer');
    }
    expect(PRIVATE_FILE_CSP).toBe("default-src 'none'; frame-ancestors 'none'; sandbox");
  });
});

describe('buildCsp', () => {
  it('without a nonce allows only same-origin scripts', () => {
    const script = parseCsp(buildCsp({})).get('script-src');
    expect(script).toEqual(["'self'"]);
  });
  it('exports the static header set used by both the proxy and next.config', () => {
    expectStaticHeaders((n) => Object.entries(SECURITY_HEADERS).find(([k]) => k.toLowerCase() === n)?.[1]);
  });
});
