import { buyerOrders, sellerListings, sellerSales } from '@/lib/account/queries';
import { buyerNextStep, listingStatusLabel, orderStatusLabel, sellerNextStep, type ListingStatus } from '@/lib/account/labels';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import EmptyState from '../_components/empty-state';
import { IconChevronRight, IconOrders, IconSell, IconWallet } from '../_components/icons';
import { requireUser } from '../session';
import UploadReceived from './upload-received';
import WithdrawButton from './withdraw-button';

export const metadata = { title: 'Mis órdenes' };
export const dynamic = 'force-dynamic';

// Presentation only. Card tint by state, from the buyer's and the seller's point of view:
// sky = in progress, mint = completed, sun = needs attention, plain = closed/neutral.
// The state is always also written in the chip.
const BUYER_TONE: Record<OrderState, string> = {
  creada: 'pastel tone-sun',
  transferencia_pendiente: 'pastel tone-sky',
  comprobante_en_revision: 'pastel tone-sky',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: '',
  cancelada: '',
};
const SELLER_TONE: Record<OrderState, string> = {
  creada: '',
  comprobante_en_revision: '',
  transferencia_pendiente: 'pastel tone-sun',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: '',
  cancelada: '',
};
const LISTING_TONE: Record<ListingStatus, string> = {
  pending: 'chip warning',
  verified: 'chip info',
  rejected: 'chip danger',
  sold: 'chip success',
  withdrawn: 'chip neutral',
};

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const user = await requireUser('/mis-ordenes');
  const db = getDb();
  const [orders, sales, mine, q] = await Promise.all([
    buyerOrders(db, user.userId),
    sellerSales(db, user.userId),
    sellerListings(db, user.userId),
    searchParams,
  ]);
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">Tu cuenta</p>
        <h1>Mis órdenes</h1>
      </header>
      {q.pago === 'ok' ? <p role="status" className="ok">¡Pago recibido! Queda retenido hasta después del evento.</p> : null}
      {q.pago === 'rechazado' ? <p role="alert" className="error">El pago fue rechazado. No se te cobró.</p> : null}

      <nav className="list-group" aria-label="Secciones">
        <a className="list-row" href="#compras">
          <IconOrders />
          <span className="list-label">Mis compras</span>
          <span className="list-count">{orders.length}</span>
          <span className="list-chevron" aria-hidden="true"><IconChevronRight /></span>
        </a>
        <a className="list-row" href="#ventas">
          <IconWallet />
          <span className="list-label">Mis ventas</span>
          <span className="list-count">{sales.length}</span>
          <span className="list-chevron" aria-hidden="true"><IconChevronRight /></span>
        </a>
        <a className="list-row" href="#publicaciones">
          <IconSell />
          <span className="list-label">Mis publicaciones</span>
          <span className="list-count">{mine.length}</span>
          <span className="list-chevron" aria-hidden="true"><IconChevronRight /></span>
        </a>
      </nav>

      <h2 id="compras" className="section-title">Mis compras</h2>
      {orders.length === 0 ? (
        <EmptyState>
          <p>Todavía no has comprado entradas.</p>
          <a className="btn sm secondary" href="/">Ver eventos</a>
        </EmptyState>
      ) : null}
      <div className="stack">
        {orders.map((o) => {
          const step = buyerNextStep({ state: o.state, deliveryMode: o.deliveryMode, hasOpenDispute: o.hasOpenDispute, paymentMethod: o.paymentMethod });
          return (
            <div key={o.orderId} className={`card ${BUYER_TONE[o.state]}`}>
              <div className="card-head">
                <h3>{o.eventName}</h3>
                <span className="chip">{orderStatusLabel(o.state)}</span>
              </div>
              <div className="muted money">{formatPanamaDateTime(o.startsAt)} · {formatUsd(o.priceCents)}</div>
              {o.state === 'transferencia_pendiente' && o.transferDeadline && !o.paymentMethod ? (
                <p className="notice">El vendedor tiene hasta {formatPanamaDateTime(o.transferDeadline)} para transferirte la entrada.</p>
              ) : null}
              <p>{step.text}</p>
              <div className="actions">
                {step.actions.includes('pay_manual') ? (
                  <a className="btn" href={`/pago-manual/${o.orderId}`}>
                    {o.state === 'comprobante_en_revision' ? 'Ver o reemplazar comprobante' : 'Pagar y subir comprobante'}
                  </a>
                ) : null}
                {step.actions.includes('view_ticket') ? (
                  <a className="btn" href={`/api/orders/${o.orderId}/ticket`} target="_blank" rel="noopener noreferrer">Ver mi entrada</a>
                ) : null}
                {step.actions.includes('confirm_entry') ? (
                  <a className="btn" href={`/ingreso/${o.orderId}`}>Confirmar mi ingreso</a>
                ) : null}
                {step.actions.includes('dispute') ? (
                  <a className="btn secondary" href={`/disputa/${o.orderId}`}>Tengo un problema</a>
                ) : null}
              </div>
              {step.actions.includes('upload_received') ? <UploadReceived orderId={o.orderId} /> : null}
            </div>
          );
        })}
      </div>

      <h2 id="ventas" className="section-title">Mis ventas</h2>
      {sales.length === 0 ? (
        <EmptyState>
          <p>Aún no tienes ventas.</p>
        </EmptyState>
      ) : null}
      <div className="stack">
        {sales.map((s) => (
          <div key={s.orderId} className={`card ${SELLER_TONE[s.state]}`}>
            <div className="card-head">
              <h3>{s.eventName}</h3>
              <span className="chip">{orderStatusLabel(s.state)}</span>
            </div>
            <div className="muted money">Recibirás {formatUsd(s.netCents)} (después de la comisión)</div>
            <p>{sellerNextStep({ state: s.state, deliveryMode: s.deliveryMode, payoutStatus: s.payoutStatus })}</p>
            {s.state === 'transferencia_pendiente' && s.transferDeadline ? (
              <p className="notice warning">Transfiere la entrada antes de {formatPanamaDateTime(s.transferDeadline)}.</p>
            ) : null}
          </div>
        ))}
      </div>

      <h2 id="publicaciones" className="section-title">Mis publicaciones</h2>
      {mine.length === 0 ? (
        <EmptyState>
          <p>No has publicado entradas.</p>
          <a className="btn sm secondary" href="/vender">Vender una entrada</a>
        </EmptyState>
      ) : (
        <div className="list-group">
          {mine.map((l) => (
            <div key={l.listingId} className="list-row">
              <IconSell />
              <div className="list-label">
                {l.eventName}
                <div className="list-sub">
                  <span className="muted money">{formatUsd(l.askCents)}</span>
                  <span className={LISTING_TONE[l.status]}>{listingStatusLabel(l.status)}</span>
                </div>
              </div>
              {l.status === 'pending' || l.status === 'verified' ? <WithdrawButton listingId={l.listingId} /> : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
