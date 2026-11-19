import { notFound } from 'next/navigation';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { eventCoverImage } from '@/lib/ui/event-cover';
import BackLink from '../../_components/back-link';
import EventPoster from '../../_components/event-poster';
import { IconShieldCheck } from '../../_components/icons';
import { requireUser } from '../../session';
import DisputeForm from './dispute-form';

export const metadata = { title: 'Reportar un problema' };
export const dynamic = 'force-dynamic';

const DISPUTABLE = ['transferencia_pendiente', 'entrada_recibida', 'ingreso_confirmado'];

export default async function DisputePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/disputa/${orderId}`);
  const order = (await buyerOrders(getDb(), user.userId)).find((o) => o.orderId === orderId);
  if (!order) notFound();
  return (
    <main className="page wide">
      <BackLink href="/mis-ordenes">Mis órdenes</BackLink>
      <header className="page-head">
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" />
          Protección en escrow
        </p>
        <h1>Reportar un problema</h1>
        <p className="lead">{order.eventName} · {formatPanamaDateTime(order.startsAt)}</p>
      </header>

      <div className="flow-layout">
        <aside className="flow-aside" aria-label="Resumen de disputa">
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
          <section className="protect on-scrim" aria-labelledby="dispute-escrow-title">
            <div className="protect-head">
              <span className="protect-icon" aria-hidden="true">
                <IconShieldCheck />
              </span>
              <h2 id="dispute-escrow-title">Tu dinero sigue retenido</h2>
            </div>
            <p className="muted">Pausamos cualquier liberación automática al vendedor mientras el equipo revisa tus evidencias.</p>
          </section>
        </aside>

        <div className="flow-card">
          {DISPUTABLE.includes(order.state) ? (
            <>
              <p>
                Cuéntanos qué pasó (por ejemplo, que la entrada no funcionó en la puerta). Tu dinero queda retenido mientras lo revisamos y,
                si tienes razón, te lo devolvemos completo. Puedes reportar hasta 12 horas después del inicio del evento.
              </p>
              <DisputeForm orderId={orderId} />
            </>
          ) : (
            <p className="notice">Esta compra ya no admite reportes.</p>
          )}
        </div>
      </div>
    </main>
  );
}
