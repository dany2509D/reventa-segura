import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeGateway } from './fake-gateway';
import { getPaymentGateway } from './index';

afterEach(() => vi.unstubAllEnvs());

describe('getPaymentGateway', () => {
  it('returns the test-mode gateway outside production', () => {
    vi.stubEnv('FAKE_GATEWAY_SECRET', 'factory-secret');
    expect(getPaymentGateway()).toBeInstanceOf(FakeGateway);
  });

  it('refuses the fake gateway in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FAKE_GATEWAY_SECRET', 'factory-secret');
    vi.stubEnv('ALLOW_FAKE_GATEWAY', '');
    expect(() => getPaymentGateway()).toThrow(/production/i);
    vi.stubEnv('ALLOW_FAKE_GATEWAY', 'true');
    expect(() => getPaymentGateway()).toThrow(/production/i);
  });

  it('allows the fake gateway in production only with ALLOW_FAKE_GATEWAY=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FAKE_GATEWAY_SECRET', 'factory-secret');
    vi.stubEnv('ALLOW_FAKE_GATEWAY', '1');
    expect(getPaymentGateway()).toBeInstanceOf(FakeGateway);
  });
});
