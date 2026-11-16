import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alert, errorName, log, redact } from './log';

let out: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  out = vi.spyOn(console, 'log').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  err = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const lineOf = (spy: ReturnType<typeof vi.spyOn>) => {
  expect(spy).toHaveBeenCalledTimes(1);
  const args = spy.mock.calls[0];
  expect(args).toHaveLength(1); // exactly one string: one JSON line
  expect(typeof args[0]).toBe('string');
  expect(args[0]).not.toContain('\n');
  return JSON.parse(args[0] as string) as Record<string, unknown>;
};

describe('log', () => {
  it('writes one JSON line per call: info to stdout, warn and error to stderr', () => {
    log('info', 'started', { orderId: 'o-1' });
    log('warn', 'odd');
    log('error', 'broken');
    expect(lineOf(out)).toMatchObject({ level: 'info', msg: 'started', ctx: { orderId: 'o-1' } });
    expect(lineOf(warn)).toMatchObject({ level: 'warn', msg: 'odd' });
    const e = lineOf(err);
    expect(e).toMatchObject({ level: 'error', msg: 'broken' });
    expect(typeof e.time).toBe('string');
  });

  it('never emits a phone number passed as context', () => {
    log('error', 'otp failed', { phone: '+50761234567' });
    const raw = err.mock.calls[0][0] as string;
    expect(raw).not.toContain('61234567');
    expect(JSON.parse(raw).ctx.phone).toBe('[redacted]');
  });

  it('redacts sensitive keys at any depth, in objects and arrays', () => {
    log('info', 'x', {
      user: { cedula: '8-123-456', profile: { sessionToken: 'tok', Authorization: 'Bearer abc' } },
      list: [{ code: '123456' }, { totp_secret: 'S' }, { bankRef: 'BG-1' }, { bank_ref: 'BG-2' }],
      headers: { cookie: 'session=abc', 'x-password': 'p' },
      orderId: 'keep-me',
    });
    const raw = out.mock.calls[0][0] as string;
    for (const leaked of ['8-123-456', 'tok', 'Bearer abc', '123456', '"S"', 'BG-1', 'BG-2', 'session=abc', '"p"']) {
      expect(raw).not.toContain(leaked);
    }
    expect(raw).toContain('keep-me');
  });

  it('redacts phone numbers and 6-digit codes inside string values and the message', () => {
    log('warn', 'sms to +50761234567 failed', {
      note: 'buyer +50769876543 typed code 482913 twice',
      plain: '50761112222',
      amountCents: 150000, // numbers are data, not codes
      id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });
    const raw = warn.mock.calls[0][0] as string;
    for (const leaked of ['61234567', '69876543', '482913', '61112222']) expect(raw).not.toContain(leaked);
    expect(raw).toContain('150000');
    expect(raw).toContain('0f8fad5b-d9cb-469f-a165-70867728950e');
  });

  it('logs only the name of an Error, never its message or stack', () => {
    log('error', 'db', { error: new TypeError('select … params: +50761234567') });
    const raw = err.mock.calls[0][0] as string;
    expect(JSON.parse(raw).ctx.error).toEqual({ name: 'TypeError' });
    expect(raw).not.toContain('params');
  });

  it('does not crash on circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const b: unknown[] = [a];
    a.list = b;
    expect(() => log('info', 'circular', { a })).not.toThrow();
    expect(lineOf(out).ctx).toMatchObject({ a: { name: 'a', self: '[circular]' } });
  });

  it('keeps a shared, non-circular object in both places', () => {
    const shared = { k: 1 };
    log('info', 'shared', { x: shared, y: shared });
    expect(lineOf(out).ctx).toEqual({ x: { k: 1 }, y: { k: 1 } });
  });

  it('never throws, even for values JSON cannot serialise', () => {
    expect(() => log('info', 'odd values', { big: 10n, fn: () => 1, buf: Buffer.from('secret-bytes') })).not.toThrow();
    const raw = out.mock.calls[0][0] as string;
    expect(raw).not.toContain('secret-bytes');
    expect(JSON.parse(raw).ctx.big).toBe('10');
  });
});

describe('alert', () => {
  it('is an error-level line flagged alert: true, redacted like any log', () => {
    alert('payment_webhook_failed', { error: new Error('boom'), phone: '+50761234567' });
    const line = lineOf(err);
    expect(line).toMatchObject({ level: 'error', alert: true, msg: 'payment_webhook_failed', ctx: { error: { name: 'Error' } } });
    expect(JSON.stringify(line)).not.toContain('61234567');
  });
});

describe('redact / errorName', () => {
  it('redact leaves safe values untouched', () => {
    expect(redact({ orderId: 'o-1', n: 3, ok: true, nothing: null })).toEqual({ orderId: 'o-1', n: 3, ok: true, nothing: null });
  });
  it('errorName gives the class name or UnknownError', () => {
    expect(errorName(new RangeError('x'))).toBe('RangeError');
    expect(errorName('string thrown')).toBe('UnknownError');
  });
});
