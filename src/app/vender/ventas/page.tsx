import { sellerEarnings } from '@/lib/account/earnings';
import { orderStatusLabel, sellerNextStep } from '@/lib/account/labels';
import { sellerSales } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../../_components/empty-state';
import EscrowTrack from '../../_components/escrow-track';
import EventPoster from '../../_components/event-poster';
import { requireUser } from '../../session';

export const metadata = { title: 'Mis ventas' };
export const dynamic = 'force-dynamic';

const SELLER_TONE: Record<OrderState, string> = {
  creada: '',
  comprobante_en_revision: '',
  transferencia_pendiente: 'pastel tone-sun',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: 'is-closed',
  cancelada: 'is-closed',
};
const SELLER_STAGES = ['Retenido', 'Entregada', 'Liquidado'] as const;

export default async function MySalesPage() {
  const user = await requireUser('/vender/ventas');
  const sales = await sellerSales(getDb(), user.userId);
  const money = sellerEarnings(sales);

  return (
    <section className="section-panel" aria-labelledby="sales-title">
      <ul className="section-stats" aria-label="Tus ganancias">
        <li className="section-stat">
          <strong className="money">{formatUsd(money.heldCents)}</strong>
          <span>Retenido en escrow</span>
        </li>
        <li className="section-stat">
          <strong className="money">{formatUsd(money.queuedCents)}</strong>
          <span>Por pagarte</span>
        </li>
        <li className="section-stat">
          <strong className="money">{formatUsd(money.paidCents)}</strong>
          <span>Pagado</span>
        </li>
      </ul>

      <h2 id="sales-title" className="section-title">
        Mis ventas <span className="count">{String(sales.length).padStart(2, '0')}</span>
      </h2>
      {sales.length === 0 ? (
        <EmptyState>
          <p>Aún no tienes ventas.</p>
          <p className="muted">Cuando alguien compre una de tus entradas publicadas, la verás aquí.</p>
        </EmptyState>
      ) : (
        <div className="orders-grid">
          {sales.map((s, i) => (
            <article key={s.orderId} className={`card order-card reveal reveal-${Math.min(i, 4)} ${SELLER_TONE[s.state]}`}>
              <div className="order-top">
                <div className="order-thumb">
                  <EventPoster seed={s.eventId} title={s.eventName} image={eventCoverImage(s.eventId, s.eventName)} size="thumb" sizes="56px" />
                </div>
                <div className="order-title-row">
                  <div>
                    <h3>{s.eventName}</h3>
                    <div className="muted money">
                      {formatPanamaDateTime(s.startsAt)} · Cobro neto: {formatUsd(s.netCents)}
                    </div>
                  </div>
                  <span className="chip">{orderStatusLabel(s.state)}</span>
                </div>
              </div>
              <EscrowTrack state={s.state} labels={SELLER_STAGES} />
              <p>{sellerNextStep({ state: s.state, deliveryMode: s.deliveryMode, payoutStatus: s.payoutStatus })}</p>
              {s.state === 'transferencia_pendiente' && s.transferDeadline ? (
                <p className="notice warning">Transfiere la entrada antes de {formatPanamaDateTime(s.transferDeadline)}.</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
