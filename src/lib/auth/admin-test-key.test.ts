import { randomBytes, timingSafeEqual } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Spy on the real comparison to prove the key check goes through it.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import { ADMIN_TEST_KEY_HEADER, ADMIN_TEST_KEY_MIN_LENGTH, isUsableAdminTestKey, mayRevealAdminLoginCode } from './admin-test-key';

// Generated per run: no secret is written in this file.
const KEY = randomBytes(32).toString('hex');
const ON = { TEST_MODE_SHOW_LOGIN_CODE: '1', NODE_ENV: 'development', TEST_MODE_ADMIN_KEY: KEY };

const req = (key?: string) =>
  new Request('http://localhost/api/auth/test-code', {
    method: 'POST',
    headers: key === undefined ? {} : { [ADMIN_TEST_KEY_HEADER]: key },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(timingSafeEqual).mockClear();
});

describe('admin test key constants', () => {
  it('header x-test-admin-key, at least 32 characters', () => {
    expect(ADMIN_TEST_KEY_HEADER).toBe('x-test-admin-key');
    expect(ADMIN_TEST_KEY_MIN_LENGTH).toBe(32);
  });

  it.each([
    [undefined, false],
    ['', false],
    ['a'.repeat(31), false],
    ['a'.repeat(32), true],
    [KEY, true],
  ])('isUsableAdminTestKey(%j) → %s', (key, expected) => {
    expect(isUsableAdminTestKey(key)).toBe(expected);
  });
});

describe('mayRevealAdminLoginCode', () => {
  it('true only with test mode on, a non-production NODE_ENV, a usable key and the same key in the header', () => {
    expect(mayRevealAdminLoginCode(req(KEY), ON)).toBe(true);
    expect(mayRevealAdminLoginCode(req(KEY), { ...ON, NODE_ENV: 'test' })).toBe(true);
    expect(mayRevealAdminLoginCode(req(KEY), { ...ON, NODE_ENV: undefined })).toBe(true);
  });

  it.each([
    ['test mode off', req(KEY), { ...ON, TEST_MODE_SHOW_LOGIN_CODE: '' }],
    ['test mode flag not exactly 1', req(KEY), { ...ON, TEST_MODE_SHOW_LOGIN_CODE: 'true' }],
    ['NODE_ENV=production', req(KEY), { ...ON, NODE_ENV: 'production' }],
    ['NODE_ENV=production even with ALLOW_TEST_LOGIN_CODES=1', req(KEY), { ...ON, NODE_ENV: 'production', ALLOW_TEST_LOGIN_CODES: '1' }],
    ['key unset', req(''), { ...ON, TEST_MODE_ADMIN_KEY: undefined }],
    ['key empty, empty header', req(''), { ...ON, TEST_MODE_ADMIN_KEY: '' }],
    ['key too short, header equal to it', req(KEY.slice(0, 31)), { ...ON, TEST_MODE_ADMIN_KEY: KEY.slice(0, 31) }],
    ['no header', req(), ON],
    ['empty header', req(''), ON],
    ['wrong key, same length', req(randomBytes(32).toString('hex')), ON],
    ['key plus a suffix', req(`${KEY}0`), ON],
    ['a prefix of the key', req(KEY.slice(0, 40)), ON],
    ['the key in upper case', req(KEY.toUpperCase()), ON],
  ])('false: %s', (_case, request, env) => {
    expect(mayRevealAdminLoginCode(request, env)).toBe(false);
  });

  it('compares with crypto.timingSafeEqual over two SHA-256 digests (equal length whatever the input)', () => {
    mayRevealAdminLoginCode(req('short'), ON);
    mayRevealAdminLoginCode(req(KEY), ON);
    const calls = vi.mocked(timingSafeEqual).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [a, b] of calls) {
      expect(Buffer.isBuffer(a) && Buffer.isBuffer(b)).toBe(true);
      expect((a as Buffer).length).toBe(32);
      expect((b as Buffer).length).toBe(32);
      // Digests, never the raw key.
      expect((a as Buffer).toString('utf8')).not.toContain(KEY);
      expect((b as Buffer).toString('utf8')).not.toContain(KEY);
    }
  });

  it('never consults the header when a precondition already fails (feature off, production, bad key)', () => {
    mayRevealAdminLoginCode(req(KEY), { ...ON, TEST_MODE_SHOW_LOGIN_CODE: '' });
    mayRevealAdminLoginCode(req(KEY), { ...ON, NODE_ENV: 'production', ALLOW_TEST_LOGIN_CODES: '1' });
    mayRevealAdminLoginCode(req(''), { ...ON, TEST_MODE_ADMIN_KEY: '' });
    expect(vi.mocked(timingSafeEqual)).not.toHaveBeenCalled();
  });

  it('reads process.env by default, and a production process never qualifies whatever env is passed', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', '1');
    vi.stubEnv('TEST_MODE_ADMIN_KEY', KEY);
    expect(mayRevealAdminLoginCode(req(KEY))).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_TEST_LOGIN_CODES', '1');
    expect(mayRevealAdminLoginCode(req(KEY))).toBe(false);
    expect(mayRevealAdminLoginCode(req(KEY), ON)).toBe(false); // ON says development; the process says production
  });
});
