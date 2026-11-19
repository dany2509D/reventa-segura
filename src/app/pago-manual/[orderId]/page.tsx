import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { events, listings, orders } from '@/lib/db/schema';
import { formatUsd } from '@/lib/format';
import { isUuid } from '@/lib/uuid';
import BackLink from '../../_components/back-link';
import { IconShieldCheck } from '../../_components/icons';
import { requireUser } from '../../session';
import ProofForm from './proof-form';

export const metadata = { title: 'Pago por transferencia' };
export const dynamic = 'force-dynamic';

// Public (non-secret) payment instructions, configurable per deployment.
const YAPPY_ALIAS = process.env.NEXT_PUBLIC_YAPPY_ALIAS?.trim() || 'Por configurar: pídenos el alias de Yappy por soporte.';
const ACH_INFO = process.env.NEXT_PUBLIC_ACH_INFO?.trim() || 'Por configurar: pídenos los datos de la cuenta ACH por soporte.';

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
    <main className="page wide">
      <BackLink href="/mis-ordenes">Mis órdenes</BackLink>
      <header className="page-head">
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" />
          Reserva activa · {row.method === 'yappy' ? 'Yappy' : 'ACH'}
        </p>
        <h1>Paga con {row.method === 'yappy' ? 'Yappy' : 'transferencia ACH'}</h1>
        <p className="lead">{row.eventName}</p>
      </header>

      <div className="flow-layout">
        <aside className="flow-aside" aria-label="Datos de pago">
          <div className="flow-card stack">
            <span className="price-label">Monto exacto</span>
            <p className="price price-lg">{formatUsd(row.priceCents)}</p>
            {row.method === 'yappy' ? (
              <p>
                Envía el pago por Yappy a: <strong>{YAPPY_ALIAS}</strong>
              </p>
            ) : (
              <p>
                Transfiere por ACH a: <strong>{ACH_INFO}</strong>
              </p>
            )}
            <div className="pay-ref-box">
              <div>
                <span className="price-label">Referencia obligatoria</span>
                <div className="pay-ref-code" data-testid="payment-ref">{row.ref}</div>
              </div>
              <span className="chip info">En descripción</span>
            </div>
          </div>
          <section className="protect on-scrim" aria-labelledby="manual-escrow-title">
            <div className="protect-head">
              <span className="protect-icon" aria-hidden="true">
                <IconShieldCheck />
              </span>
              <h2 id="manual-escrow-title">Pago retenido en escrow</h2>
            </div>
            <p className="muted">Tu dinero queda protegido dentro de la plataforma y solo pasa al vendedor cuando cierre el evento sin incidencias.</p>
          </section>
        </aside>

        <div className="flow-card">
          {inReview ? (
            <p role="status" className="ok">Recibimos tu comprobante y lo estamos revisando. Puedes reemplazarlo si te equivocaste.</p>
          ) : null}
          <ProofForm orderId={orderId} deadlineIso={row.transferDeadline.toISOString()} inReview={inReview} />
        </div>
      </div>
    </main>
  );
}
