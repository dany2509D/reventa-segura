import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_CODE_USAGE,
  NO_RECENT_CODE_MESSAGE,
  adminKeyProblem,
  buildTestCodeRequest,
  describeFetchFailure,
  interpretTestCodeResponse,
  isLocalHostname,
  parseAdminCodeArgs,
  resolveTestCodeEndpoint,
} from './admin-code-cli';

// Generated per run: no secret is written in this file.
const KEY = randomBytes(32).toString('hex');

describe('parseAdminCodeArgs', () => {
  it('a phone number (any accepted spelling) → normalized', () => {
    expect(parseAdminCodeArgs(['+50761234567'])).toEqual({ kind: 'code', phone: '+50761234567' });
    expect(parseAdminCodeArgs(['6123-4567'])).toEqual({ kind: 'code', phone: '+50761234567' });
    expect(parseAdminCodeArgs(['6123', '4567'])).toEqual({ kind: 'code', phone: '+50761234567' }); // typed with a space
  });

  it('--url, as "--url X" or "--url=X", before or after the phone', () => {
    expect(parseAdminCodeArgs(['61234567', '--url', 'http://localhost:3001'])).toEqual({
      kind: 'code',
      phone: '+50761234567',
      url: 'http://localhost:3001',
    });
    expect(parseAdminCodeArgs(['--url=http://127.0.0.1:4000', '61234567'])).toEqual({
      kind: 'code',
      phone: '+50761234567',
      url: 'http://127.0.0.1:4000',
    });
  });

  it('--init alone → init', () => {
    expect(parseAdminCodeArgs(['--init'])).toEqual({ kind: 'init' });
  });

  it.each([['--help'], ['-h']])('%s → usage without an error', (flag) => {
    expect(parseAdminCodeArgs([flag])).toEqual({ kind: 'usage' });
  });

  it.each([
    ['no arguments', []],
    ['an invalid number', ['12345']],
    ['a foreign number', ['+14155550100']],
    ['--url without a value', ['61234567', '--url']],
    ['--url= empty', ['61234567', '--url=']],
    ['an unknown option', ['61234567', '--verbose']],
    ['--init with a phone', ['--init', '61234567']],
    ['--init with --url', ['--init', '--url', 'http://localhost:3000']],
    ['--url given twice', ['61234567', '--url', 'http://localhost:1', '--url', 'http://localhost:2']],
  ])('%s → usage with a Spanish error', (_case, argv) => {
    const r = parseAdminCodeArgs(argv);
    expect(r.kind).toBe('usage');
    expect(r.kind === 'usage' && r.error).toBeTruthy();
  });

  it('the usage text shows both commands', () => {
    expect(ADMIN_CODE_USAGE).toContain('npm run admin:code -- <');
    expect(ADMIN_CODE_USAGE).toContain('npm run admin:code -- --init');
    expect(ADMIN_CODE_USAGE).toContain('--url');
  });
});

describe('isLocalHostname', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '[::1]'])('%s is this computer', (h) => {
    expect(isLocalHostname(h)).toBe(true);
  });

  it.each(['192.168.1.20', '10.0.0.5', '0.0.0.0', '127.0.0.2', 'localhost.evil.example', 'evil.localhost', 'example.com', '[::2]', ''])(
    '%j is not',
    (h) => {
      expect(isLocalHostname(h)).toBe(false);
    },
  );
});

describe('resolveTestCodeEndpoint', () => {
  it('defaults to http://localhost:3000, or PORT', () => {
    expect(resolveTestCodeEndpoint({}).href).toBe('http://localhost:3000/api/auth/test-code');
    expect(resolveTestCodeEndpoint({ port: '' }).href).toBe('http://localhost:3000/api/auth/test-code');
    expect(resolveTestCodeEndpoint({ port: '3100' }).href).toBe('http://localhost:3100/api/auth/test-code');
  });

  it.each(['abc', '0', '65536', '-1', '3000 ', '30.5'])('rejects PORT=%j', (port) => {
    expect(() => resolveTestCodeEndpoint({ port })).toThrow(/PORT/);
  });

  it.each([
    ['http://localhost:3001', 'http://localhost:3001/api/auth/test-code'],
    ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000/api/auth/test-code'],
    ['http://[::1]:3000', 'http://[::1]:3000/api/auth/test-code'],
    ['https://localhost:8443/some/path?x=1', 'https://localhost:8443/api/auth/test-code'],
    ['http://LOCALHOST:3000', 'http://localhost:3000/api/auth/test-code'],
  ])('--url %s → %s (only the origin is used); --url wins over PORT', (url, expected) => {
    expect(resolveTestCodeEndpoint({ url, port: '9999' }).href).toBe(expected);
  });

  it.each([
    'http://192.168.1.20:3000',
    'http://10.0.0.5:3000',
    'http://0.0.0.0:3000',
    'http://example.com',
    'https://reventa-segura.vercel.app',
    'http://localhost.evil.example:3000',
    'http://evil.example#@localhost:3000',
    'http://user:pass@localhost:3000',
    'ftp://localhost',
    'file:///etc/passwd',
    'localhost:3000',
    'not a url',
  ])('refuses %s: the key must never leave this computer', (url) => {
    expect(() => resolveTestCodeEndpoint({ url })).toThrow();
  });

  it('the refusal message explains why', () => {
    expect(() => resolveTestCodeEndpoint({ url: 'http://192.168.1.20:3000' })).toThrow(/localhost/);
  });
});

describe('buildTestCodeRequest', () => {
  const endpoint = new URL('http://localhost:3000/api/auth/test-code');

  it('POSTs JSON { phone } with the key header and a same-origin Origin, never following redirects', () => {
    const init = buildTestCodeRequest(endpoint, '+50761234567', KEY);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error'); // a redirect could carry the header to another host
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('origin')).toBe('http://localhost:3000');
    expect(headers.get('x-test-admin-key')).toBe(KEY);
    expect(JSON.parse(String(init.body))).toEqual({ phone: '+50761234567' });
  });

  it('keeps the phone out of the URL', () => {
    buildTestCodeRequest(endpoint, '+50761234567', KEY);
    expect(endpoint.href).not.toContain('6123');
  });

  it('refuses to build a request for another host (defence in depth)', () => {
    expect(() => buildTestCodeRequest(new URL('http://192.168.1.20:3000/api/auth/test-code'), '+50761234567', KEY)).toThrow();
    expect(() => buildTestCodeRequest(new URL('https://example.com/api/auth/test-code'), '+50761234567', KEY)).toThrow();
  });
});

describe('adminKeyProblem', () => {
  it('null for a usable key', () => {
    expect(adminKeyProblem(KEY)).toBeNull();
    expect(adminKeyProblem('a'.repeat(32))).toBeNull();
  });

  it.each([undefined, ''])('missing (%j) → explains how to create it with --init', (key) => {
    const msg = adminKeyProblem(key);
    expect(msg).toContain('TEST_MODE_ADMIN_KEY');
    expect(msg).toContain('npm run admin:code -- --init');
    expect(msg).toMatch(/reinicia/i);
  });

  it.each([
    ['too short', 'a'.repeat(31)],
    ['with a space', `${'a'.repeat(32)} x`],
    ['non-ASCII', `${'a'.repeat(32)}ñ`],
  ])('unusable (%s) → asks to delete the line and run --init; never echoes the value', (_case, key) => {
    const msg = adminKeyProblem(key)!;
    expect(msg).toContain('TEST_MODE_ADMIN_KEY');
    expect(msg).toContain('--init');
    expect(msg).not.toContain(key);
  });
});

describe('interpretTestCodeResponse', () => {
  it('200 { code } → the 6-digit code', () => {
    expect(interpretTestCodeResponse(200, { code: '042917' }, null)).toEqual({ ok: true, code: '042917' });
  });

  it.each([[{ code: '12345' }], [{ code: 123456 }], [null], [{}], ['042917']])('200 with an unexpected body %j → error', (body) => {
    expect(interpretTestCodeResponse(200, body, null).ok).toBe(false);
  });

  it('404 → "no recent code" first, then the generic checklist, without singling out one secret condition', () => {
    const r = interpretTestCodeResponse(404, null, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(NO_RECENT_CODE_MESSAGE).toBe(
      'No hay un código reciente: pide el código en la pantalla de ingreso primero y vuelve a ejecutar esto',
    );
    expect(r.message.startsWith(NO_RECENT_CODE_MESSAGE)).toBe(true);
    expect(r.message).toContain('TEST_MODE_SHOW_LOGIN_CODE=1');
    expect(r.message).toMatch(/reinici/i);
    expect(r.message).not.toMatch(/clave (incorrecta|equivocada)/i);
  });

  it('429 → wait, with the Retry-After seconds', () => {
    const r = interpretTestCodeResponse(429, { error: 'x' }, '42');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('42');
  });

  it.each([[403], [415], [500], [302], [418]])('HTTP %i → a clear error that names the status', (status) => {
    const r = interpretTestCodeResponse(status, null, null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain(String(status));
  });
});

describe('describeFetchFailure', () => {
  const refused = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });

  it('server off (ECONNREFUSED) → tells the owner to start npm run dev', () => {
    const msg = describeFetchFailure(refused, 'http://localhost:3000');
    expect(msg).toContain('http://localhost:3000');
    expect(msg).toContain('npm run dev');
  });

  it('a timeout → says the server did not answer in time', () => {
    const msg = describeFetchFailure(Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'http://localhost:3000');
    expect(msg).toMatch(/a tiempo/);
  });

  it('anything else → a generic connection message', () => {
    expect(describeFetchFailure(new TypeError('fetch failed'), 'http://localhost:3000')).toContain('http://localhost:3000');
  });
});
