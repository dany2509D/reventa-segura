import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { events, listings, orders } from '@/lib/db/schema';
import { formatUsd } from '@/lib/format';
import { isUuid } from '@/lib/uuid';
import { requireUser } from '../../session';
import ProofForm from './proof-form';

export const metadata = { title: 'Pago por transferencia' };
export const dynamic = 'force-dynamic';

// Public (non-secret) payment instructions, configurable per deployment.
const YAPPY_ALIAS = process.env.NEXT_PUBLIC_YAPPY_ALIAS?.trim() || 'Por configurar: pídenos el alias de Yappy por soporte.';
const ACH_INFO = process.env.NEXT_PUBLIC_ACH_INFO?.trim() || 'Por configurar: pídenos los datos de la cuenta ACH por soporte.';

// Manual checkout (Yappy / ACH): shows where to pay, the reference, the 15-minute countdown and the
// receipt upload. Only the buyer of a manual order that is still open can see it.
export default async function ManualPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/pago-manual/${orderId}`);
  if (!isUuid(orderId)) notFound();
  const [row] = await getDb()
    .select({
      buyerId: orders.buyerId,
      state: orders.state,
      method: orders.paymentMethod,
      ref: orders.providerRef,
      priceCents: orders.priceCents,
      transferDeadline: orders.transferDeadline,
      hasProof: orders.paymentProofKey,
      eventName: events.name,
    })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(eq(orders.id, orderId));
  if (!row || row.buyerId !== user.userId || !row.method || !row.ref || !row.transferDeadline) notFound();
  if (row.state !== 'transferencia_pendiente' && row.state !== 'comprobante_en_revision') notFound();

  const inReview = row.state === 'comprobante_en_revision';
  return (
    <main className="page">
      <h1>Paga con {row.method === 'yappy' ? 'Yappy' : 'transferencia ACH'}</h1>
      <p className="muted">{row.eventName}</p>
      <div className="card stack">
        <p className="price price-lg">{formatUsd(row.priceCents)}</p>
        {row.method === 'yappy' ? (
          <p>Envía el pago por Yappy a: <strong>{YAPPY_ALIAS}</strong></p>
        ) : (
          <p>Transfiere por ACH a: <strong>{ACH_INFO}</strong></p>
        )}
        <p>
          Escribe este código de referencia en la descripción:{' '}
          <strong className="money" data-testid="payment-ref">{row.ref}</strong>
        </p>
        {inReview ? (
          <p role="status" className="ok">Recibimos tu comprobante y lo estamos revisando. Puedes reemplazarlo si te equivocaste.</p>
        ) : null}
        <ProofForm orderId={orderId} deadlineIso={row.transferDeadline.toISOString()} inReview={inReview} />
      </div>
    </main>
  );
}
