import { getPaymentGateway } from '@/lib/payments';
import { FakeGateway } from '@/lib/payments/fake-gateway';

/**
 * True while the configured payment gateway is the test one (no real money moves). Server only.
 * Same check as the test checkout page (pago-de-prueba): a production server without a gateway
 * throws from getPaymentGateway, which counts as "not test mode".
 */
export function isTestMode(): boolean {
  try {
    return getPaymentGateway() instanceof FakeGateway;
  } catch {
    return false;
  }
}

/**
 * Small, always-visible marker shown wherever money is mentioned while payments are in test mode.
 * `short` is the one-line wording for tight places (the purchase bar pinned on phones).
 */
export function TestModeNotice({ block = false, short = false }: { block?: boolean; short?: boolean }) {
  if (!isTestMode()) return null;
  return (
    <p className={block ? 'test-mode block' : 'test-mode'}>
      {short ? 'Modo de prueba: sin cobro real' : 'Modo de prueba: aún no se cobra dinero real.'}
    </p>
  );
}
