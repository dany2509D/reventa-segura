import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { formatUsd } from '@/lib/format';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { getPaymentGateway } from '@/lib/payments';
import { requireUser } from '../../session';
import Checkout from './checkout';

export const metadata = { title: 'Pago de prueba' };
export const dynamic = 'force-dynamic';

// Test-mode checkout (no real money): only exists while the fake gateway is the configured one
// (never in production unless ALLOW_FAKE_GATEWAY=1). A real gateway redirects to its own page.
export default async function TestPaymentPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  let isFake = false;
  try {
    isFake = getPaymentGateway() instanceof FakeGateway;
  } catch {
    isFake = false;
  }
  if (!isFake) notFound();

  const user = await requireUser(`/pago-de-prueba/${ref}`);
  const [order] = await getDb().select().from(orders).where(eq(orders.providerRef, decodeURIComponent(ref)));
  if (!order || order.buyerId !== user.userId || order.state !== 'creada') notFound();

  return (
    <main className="page wide">
      <h1>Pago de prueba</h1>
      <p className="notice warning">Modo de prueba: no se cobra dinero real.</p>
      <Checkout
        reference={decodeURIComponent(ref)}
        totalLabel={formatUsd(order.priceCents)}
        ticketLabel={formatUsd(order.priceCents - order.feeCents)}
        feeLabel={formatUsd(order.feeCents)}
      />
    </main>
  );
}
