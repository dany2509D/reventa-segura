import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchTestLoginCode } from './test-login-code';
import { TestCodeNotice } from '@/app/ingresar/login-form';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchTestLoginCode', () => {
  it('POSTs the phone as JSON (never in the URL) and returns the 6-digit code', async () => {
    const f = stubFetch(async () => Response.json({ code: '042917' }));
    expect(await fetchTestLoginCode('6123-4567')).toBe('042917');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/test-code');
    expect(url).not.toContain('6123');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ phone: '6123-4567' });
  });

  it.each([
    ['404 (test mode off: production behaviour)', async () => new Response(null, { status: 404 })],
    ['429', async () => Response.json({ error: 'x' }, { status: 429 })],
    ['a body without a code', async () => Response.json({})],
    ['a code that is not 6 digits', async () => Response.json({ code: '<b>12</b>' })],
    ['a network error', async () => { throw new TypeError('offline'); }],
  ])('%s → null (nothing is shown)', async (_case, impl) => {
    stubFetch(impl as () => Promise<Response>);
    expect(await fetchTestLoginCode('61234567')).toBeNull();
  });
});

describe('TestCodeNotice', () => {
  it('shows the code with the test-mode label and a button that fills the field', () => {
    const html = renderToStaticMarkup(createElement(TestCodeNotice, { code: '123456', onUse: () => {} }));
    expect(html.replace(/<[^>]+>/g, '')).toContain('Modo de prueba: tu código es 123456');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Usar este código<\/button>/);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('style=');
  });
});
