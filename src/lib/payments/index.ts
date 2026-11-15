import { FakeGateway } from './fake-gateway';
import type { PaymentGateway } from './gateway';

/**
 * The one place route handlers and jobs get their payment gateway from. Only the test-mode
 * FakeGateway exists so far; production refuses it unless ALLOW_FAKE_GATEWAY=1 is set on purpose
 * (e.g. a pre-launch deployment with test payments), so a forgotten switch cannot go live.
 */
export function getPaymentGateway(): PaymentGateway {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FAKE_GATEWAY !== '1') {
    throw new Error('No real payment gateway is configured; the fake gateway is refused in production');
  }
  return new FakeGateway();
}
