import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from './canonical';

const SITE = 'https://reventa.example';
const call = (url: string, over: Partial<Parameters<typeof canonicalRedirect>[0]> = {}) =>
  canonicalRedirect({ url: new URL(url), method: 'GET', forwardedProto: null, host: new URL(url).host, siteUrl: SITE, ...over })?.toString() ?? null;

describe('canonicalRedirect', () => {
  it('leaves canonical requests alone', () => {
    expect(call('https://reventa.example/eventos/1')).toBeNull();
    expect(call('http://internal/x', { host: 'reventa.example', forwardedProto: 'https' })).toBeNull();
  });

  it('upgrades plain HTTP to HTTPS, keeping path and query', () => {
    expect(call('http://reventa.example/eventos/1?a=b')).toBe('https://reventa.example/eventos/1?a=b');
    expect(call('https://internal/x?y=1', { host: 'reventa.example', forwardedProto: 'http' })).toBe('https://reventa.example/x?y=1');
  });

  it('sends the www twin to the one canonical host', () => {
    expect(call('https://www.reventa.example/privacidad')).toBe('https://reventa.example/privacidad');
    expect(call('http://www.reventa.example/')).toBe('https://reventa.example/');
  });

  it('works the other way when the canonical host is the www one', () => {
    expect(call('https://reventa.example/', { siteUrl: 'https://www.reventa.example' })).toBe('https://www.reventa.example/');
  });

  it('never moves other hosts (previews, aliases) to a different host', () => {
    expect(call('https://reventa-segura-git-x.vercel.app/')).toBeNull();
    expect(call('http://reventa-segura-git-x.vercel.app/a')).toBe('https://reventa-segura-git-x.vercel.app/a');
  });

  it('ignores local hosts so a local production build keeps working over HTTP', () => {
    expect(call('http://localhost:3000/')).toBeNull();
    expect(call('http://127.0.0.1:3000/')).toBeNull();
    expect(call('http://app.localhost:3000/')).toBeNull();
  });

  it('only redirects navigations, never a POST', () => {
    expect(call('http://reventa.example/x', { method: 'POST' })).toBeNull();
    expect(call('http://reventa.example/x', { method: 'HEAD' })).toBe('https://reventa.example/x');
  });

  it('does nothing when the canonical origin is unusable', () => {
    expect(call('https://www.reventa.example/', { siteUrl: 'not a url' })).toBeNull();
  });
});
