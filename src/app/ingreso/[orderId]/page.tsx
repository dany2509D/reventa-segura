import { notFound } from 'next/navigation';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { eventCoverImage } from '@/lib/ui/event-cover';
import BackLink from '../../_components/back-link';
import EventPoster from '../../_components/event-poster';
import { IconShieldCheck } from '../../_components/icons';
import { requireUser } from '../../session';
import EntryForm from './entry-form';

export const metadata = { title: 'Confirmar ingreso' };
export const dynamic = 'force-dynamic';

export default async function EntryPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/ingreso/${orderId}`);
  const order = (await buyerOrders(getDb(), user.userId)).find((o) => o.orderId === orderId);
  if (!order) notFound();
  return (
    <main className="page wide">
      <BackLink href="/mis-ordenes">Mis órdenes</BackLink>
      <header className="page-head">
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" />
          Check-in del evento
        </p>
        <h1>Confirmar mi ingreso</h1>
        <p className="lead">{order.eventName} · {formatPanamaDateTime(order.startsAt)}</p>
      </header>

      <div className="flow-layout">
        <aside className="flow-aside" aria-label="Resumen de tu entrada">
          <div className="sell-preview">
            <div className="sell-preview-art">
              <EventPoster
                seed={order.eventId}
                title={order.eventName}
                image={eventCoverImage(order.eventId, order.eventName)}
                size="card"
                sizes="(max-width: 899px) 100vw, 420px"
              />
            </div>
            <div className="sell-preview-body">
              <h2>{order.eventName}</h2>
              <p className="muted money">{formatPanamaDateTime(order.startsAt)} · {formatUsd(order.priceCents)}</p>
            </div>
          </div>
          <section className="protect on-scrim" aria-labelledby="entry-escrow-title">
            <div className="protect-head">
              <span className="protect-icon" aria-hidden="true">
                <IconShieldCheck />
              </span>
              <h2 id="entry-escrow-title">Cierre seguro</h2>
            </div>
            <p className="muted">Al confirmar que ingresaste, el pago se liberará al vendedor al cerrar las 12 horas posteriores al inicio del evento.</p>
          </section>
        </aside>

        <div className="flow-card">
          {order.state === 'entrada_recibida' ? (
            <>
              <p>
                Ya estás en el evento. Toma una foto de tu entrada escaneada en la puerta (o de la pantalla del escáner) y confirma.
              </p>
              <EntryForm orderId={orderId} />
            </>
          ) : (
            <p className="notice">Esta compra no está esperando la confirmación de ingreso.</p>
          )}
        </div>
      </div>
    </main>
  );
}
