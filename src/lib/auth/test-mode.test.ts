import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleSmsSender, SmsConfigError, getSmsSender } from './sms';
import {
  CapturingSmsSender,
  LOGIN_TEST_CODE_MAX_ENTRIES,
  LOGIN_TEST_CODE_TTL_MS,
  clearCapturedLoginCodes,
  isLoginCodeTestMode,
  peekCapturedLoginCode,
} from './test-mode';

const PHONE = '+50761234567';
const text = (code: string) => `Tu código de Reventa Segura es ${code}. Vence en 10 minutos.`;

beforeEach(() => clearCapturedLoginCodes());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('isLoginCodeTestMode', () => {
  it.each([
    // TEST_MODE_SHOW_LOGIN_CODE, ALLOW_TEST_LOGIN_CODES, NODE_ENV, expected
    ['1', undefined, 'development', true],
    ['1', undefined, 'test', true],
    ['1', undefined, undefined, true],
    ['1', undefined, 'production', false],
    ['1', '1', 'production', true],
    [undefined, '1', 'production', false],
    [undefined, '1', 'development', false],
    [undefined, undefined, 'development', false],
    ['', undefined, 'development', false],
    ['true', undefined, 'development', false],
    ['yes', '1', 'production', false],
    ['1', 'true', 'production', false],
    ['1', '0', 'production', false],
  ])('TEST_MODE_SHOW_LOGIN_CODE=%j ALLOW_TEST_LOGIN_CODES=%j NODE_ENV=%j → %s', (flag, allow, nodeEnv, expected) => {
    expect(isLoginCodeTestMode({ TEST_MODE_SHOW_LOGIN_CODE: flag, ALLOW_TEST_LOGIN_CODES: allow, NODE_ENV: nodeEnv })).toBe(expected);
  });

  it('reads process.env by default', () => {
    vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isLoginCodeTestMode()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLoginCodeTestMode()).toBe(false);
  });
});

describe('CapturingSmsSender', () => {
  it('stores the 6-digit code from the Spanish message per normalized phone', async () => {
    await new CapturingSmsSender().send(PHONE, text('042917'));
    expect(peekCapturedLoginCode(PHONE)).toBe('042917');
    expect(peekCapturedLoginCode('6123-4567')).toBe('042917'); // any accepted spelling of the number
    expect(peekCapturedLoginCode('+50769999999')).toBeNull();
  });

  it('reading does not consume the code; a newer code replaces the older one', async () => {
    const s = new CapturingSmsSender();
    await s.send(PHONE, text('111111'));
    expect(peekCapturedLoginCode(PHONE)).toBe('111111');
    expect(peekCapturedLoginCode(PHONE)).toBe('111111');
    await s.send(PHONE, text('222222'));
    expect(peekCapturedLoginCode(PHONE)).toBe('222222');
  });

  it('forgets a code after 10 minutes', async () => {
    const t0 = Date.UTC(2027, 0, 1);
    await new CapturingSmsSender(() => t0).send(PHONE, text('123456'));
    expect(LOGIN_TEST_CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(peekCapturedLoginCode(PHONE, t0 + LOGIN_TEST_CODE_TTL_MS - 1)).toBe('123456');
    expect(peekCapturedLoginCode(PHONE, t0 + LOGIN_TEST_CODE_TTL_MS)).toBeNull();
  });

  it('keeps at most 1000 phones, evicting the oldest', async () => {
    const s = new CapturingSmsSender();
    const phone = (i: number) => `+5076${String(i).padStart(7, '0')}`;
    for (let i = 0; i <= LOGIN_TEST_CODE_MAX_ENTRIES; i++) await s.send(phone(i), text('000001'));
    expect(LOGIN_TEST_CODE_MAX_ENTRIES).toBe(1000);
    expect(peekCapturedLoginCode(phone(0))).toBeNull();
    expect(peekCapturedLoginCode(phone(1))).toBe('000001');
    expect(peekCapturedLoginCode(phone(LOGIN_TEST_CODE_MAX_ENTRIES))).toBe('000001');
  });

  it('ignores messages without a code and invalid phones', async () => {
    const s = new CapturingSmsSender();
    await s.send(PHONE, 'Hola, sin código');
    await s.send('+14155550100', text('123456'));
    expect(peekCapturedLoginCode(PHONE)).toBeNull();
    expect(peekCapturedLoginCode('+14155550100')).toBeNull();
  });

  it('never writes the phone number or the code to the console', async () => {
    const calls: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void calls.push(args));
    }
    vi.stubEnv('NODE_ENV', 'development');
    await new CapturingSmsSender().send(PHONE, text('987654'));
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain('987654');
    expect(logged).not.toContain('61234567');
    expect(logged).not.toContain('6123');
  });

  it('process-global store: survives module reloads (dev hot reload, separate route bundles)', async () => {
    await new CapturingSmsSender().send(PHONE, text('555666'));
    vi.resetModules();
    const fresh = await import('./test-mode');
    expect(fresh.peekCapturedLoginCode(PHONE)).toBe('555666');
  });
});

describe('getSmsSender', () => {
  it.each([
    // NODE_ENV, TEST_MODE_SHOW_LOGIN_CODE, ALLOW_TEST_LOGIN_CODES, expected
    ['development', undefined, undefined, ConsoleSmsSender],
    ['test', undefined, undefined, ConsoleSmsSender],
    ['development', '1', undefined, CapturingSmsSender],
    ['test', '1', undefined, CapturingSmsSender],
    ['production', '1', '1', CapturingSmsSender],
  ])('NODE_ENV=%s TEST_MODE=%j ALLOW=%j → %o', (nodeEnv, flag, allow, Expected) => {
    const sender = getSmsSender({ NODE_ENV: nodeEnv, TEST_MODE_SHOW_LOGIN_CODE: flag, ALLOW_TEST_LOGIN_CODES: allow });
    expect(sender).toBeInstanceOf(Expected);
  });

  it.each([
    [undefined, undefined],
    ['1', undefined],
    [undefined, '1'],
  ])('production without both flags (TEST_MODE=%j ALLOW=%j) still has no SMS provider → SmsConfigError', (flag, allow) => {
    expect(() => getSmsSender({ NODE_ENV: 'production', TEST_MODE_SHOW_LOGIN_CODE: flag, ALLOW_TEST_LOGIN_CODES: allow })).toThrow(SmsConfigError);
  });

  it('defaults to process.env', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', '1');
    expect(getSmsSender()).toBeInstanceOf(CapturingSmsSender);
    vi.stubEnv('TEST_MODE_SHOW_LOGIN_CODE', '');
    expect(getSmsSender()).toBeInstanceOf(ConsoleSmsSender);
  });
});
