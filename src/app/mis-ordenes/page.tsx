import { buyerNextStep, orderStatusLabel } from '@/lib/account/labels';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../_components/empty-state';
import EscrowTrack from '../_components/escrow-track';
import EventPoster from '../_components/event-poster';
import SectionShell from '../_components/section-shell';
import { requireUser } from '../session';
import UploadReceived from './upload-received';

export const metadata = { title: 'Mis órdenes' };
export const dynamic = 'force-dynamic';

const BUYER_TONE: Record<OrderState, string> = {
  creada: 'pastel tone-sun',
  transferencia_pendiente: 'pastel tone-sky',
  comprobante_en_revision: 'pastel tone-sky',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: 'is-closed',
  cancelada: 'is-closed',
};
const FINISHED: ReadonlySet<OrderState> = new Set<OrderState>(['liberada', 'liquidada', 'reembolsada', 'cancelada']);
const BUYER_STAGES = ['Retenido', 'Entrega', 'Cerrado'] as const;

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const user = await requireUser('/mis-ordenes');
  const [orders, q] = await Promise.all([buyerOrders(getDb(), user.userId), searchParams]);
  const steps = orders.map((o) =>
    buyerNextStep({ state: o.state, deliveryMode: o.deliveryMode, hasOpenDispute: o.hasOpenDispute, paymentMethod: o.paymentMethod }),
  );
  const active = orders.filter((o) => !FINISHED.has(o.state)).length;
  const needAction = steps.filter((s, i) => s.actions.some((a) => a !== 'dispute') && orders[i].state !== 'comprobante_en_revision').length;

  return (
    <SectionShell
      tone="ordenes"
      eyebrow="Tu cuenta"
      title="Mis órdenes"
      lead="Tus compras y en qué punto del escrow está cada una."
      aside={
        <ul className="section-stats" aria-label="Resumen de tus compras">
          <li className="section-stat">
            <strong>{String(active).padStart(2, '0')}</strong>
            <span>En curso</span>
          </li>
          <li className="section-stat">
            <strong>{String(needAction).padStart(2, '0')}</strong>
            <span>Requieren acción</span>
          </li>
        </ul>
      }
    >
      {q.pago === 'ok' ? <p role="status" className="ok">¡Pago recibido! Queda retenido hasta después del evento.</p> : null}
      {q.pago === 'rechazado' ? <p role="alert" className="error">El pago fue rechazado. No se te cobró.</p> : null}

      <section className="section-panel" aria-labelledby="compras">
        <h2 id="compras" className="section-title">
          Mis compras <span className="count">{String(orders.length).padStart(2, '0')}</span>
        </h2>
        {orders.length === 0 ? (
          <EmptyState>
            <p>Todavía no has comprado entradas.</p>
            <p className="muted">Explora los próximos eventos con retención escrow en Panamá.</p>
            <a className="btn sm secondary" href="/eventos">Ver eventos</a>
          </EmptyState>
        ) : (
          <div className="orders-grid">
            {orders.map((o, i) => {
              const step = steps[i];
              return (
                <article key={o.orderId} className={`card order-card reveal reveal-${Math.min(i, 4)} ${BUYER_TONE[o.state]}`}>
                  <div className="order-top">
                    <div className="order-thumb">
                      <EventPoster seed={o.eventId} title={o.eventName} image={eventCoverImage(o.eventId, o.eventName)} size="thumb" sizes="56px" />
                    </div>
                    <div className="order-title-row">
                      <div>
                        <h3>{o.eventName}</h3>
                        <div className="muted money">
                          {formatPanamaDateTime(o.startsAt)} · {formatUsd(o.priceCents)}
                        </div>
                      </div>
                      <span className="chip">{orderStatusLabel(o.state)}</span>
                    </div>
                  </div>
                  <EscrowTrack state={o.state} labels={BUYER_STAGES} />
                  {o.state === 'transferencia_pendiente' && o.transferDeadline && !o.paymentMethod ? (
                    <p className="notice">El vendedor tiene hasta {formatPanamaDateTime(o.transferDeadline)} para transferirte la entrada.</p>
                  ) : null}
                  <p>{step.text}</p>
                  {step.actions.length > 0 ? (
                    <div className="actions">
                      {step.actions.includes('pay_manual') ? (
                        <a className="btn sm" href={`/pago-manual/${o.orderId}`}>
                          {o.state === 'comprobante_en_revision' ? 'Ver o reemplazar comprobante' : 'Pagar y subir comprobante'}
                        </a>
                      ) : null}
                      {step.actions.includes('view_ticket') ? (
                        <a className="btn sm" href={`/api/orders/${o.orderId}/ticket`} target="_blank" rel="noopener noreferrer">
                          Ver mi entrada
                        </a>
                      ) : null}
                      {step.actions.includes('confirm_entry') ? (
                        <a className="btn sm" href={`/ingreso/${o.orderId}`}>Confirmar ingreso</a>
                      ) : null}
                      {step.actions.includes('dispute') ? (
                        <a className="btn sm secondary" href={`/disputa/${o.orderId}`}>Reportar problema</a>
                      ) : null}
                    </div>
                  ) : null}
                  {step.actions.includes('upload_received') ? <UploadReceived orderId={o.orderId} /> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </SectionShell>
  );
}
