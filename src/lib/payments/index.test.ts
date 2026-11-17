import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeGateway } from './fake-gateway';
import { getPaymentGateway } from './index';

afterEach(() => vi.unstubAllEnvs());

describe('getPaymentGateway', () => {
  it('returns the test-mode gateway outside production', () => {
    vi.stubEnv('FAKE_GATEWAY_SECRET', 'factory-secret');
    expect(getPaymentGateway()).toBeInstanceOf(FakeGateway);
  });

  it.each(['', 'true', '1'])('refuses the fake gateway in production (ALLOW_FAKE_GATEWAY=%j)', (flag) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FAKE_GATEWAY_SECRET', 'factory-secret');
    vi.stubEnv('ALLOW_FAKE_GATEWAY', flag);
    expect(() => getPaymentGateway()).toThrow(/production/i);
  });
});
