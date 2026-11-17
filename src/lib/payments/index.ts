import { FakeGateway } from './fake-gateway';
import type { PaymentGateway } from './gateway';

/**
 * The one place route handlers and jobs get their payment gateway from. Only the test-mode
 * FakeGateway exists so far, and it is refused in production unconditionally: no environment
 * variable (ALLOW_FAKE_GATEWAY included) can turn it on there. Production sells through the
 * manual (Yappy / ACH) flow until a real adapter exists.
 */
export function getPaymentGateway(): PaymentGateway {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No real payment gateway is configured; the fake gateway is refused in production');
  }
  return new FakeGateway();
}
