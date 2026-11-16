import { buyerOrders, sellerListings, sellerSales } from '@/lib/account/queries';
import { buyerNextStep, listingStatusLabel, orderStatusLabel, sellerNextStep, type ListingStatus } from '@/lib/account/labels';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import { requireUser } from '../session';
import UploadReceived from './upload-received';
import WithdrawButton from './withdraw-button';

export const metadata = { title: 'Mis órdenes' };
export const dynamic = 'force-dynamic';

// Presentation only: the colour tone of each status chip (the chip always shows the status text too).
const ORDER_TONE: Record<OrderState, string> = {
  creada: 'chip warning',
  transferencia_pendiente: 'chip info',
  entrada_recibida: 'chip info',
  ingreso_confirmado: 'chip success',
  disputada: 'chip warning',
  liberada: 'chip success',
  liquidada: 'chip success',
  reembolsada: 'chip neutral',
  cancelada: 'chip neutral',
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
      <h1>Mis órdenes</h1>
      {q.pago === 'ok' ? <p role="status" className="ok">¡Pago recibido! Tu dinero está protegido.</p> : null}
      {q.pago === 'rechazado' ? <p role="alert" className="error">El pago fue rechazado. No se te cobró.</p> : null}

      <h2>Mis compras</h2>
      {orders.length === 0 ? <p className="empty">Todavía no has comprado entradas. <a href="/">Ver eventos</a></p> : null}
      <div className="stack">
        {orders.map((o) => {
          const step = buyerNextStep({ state: o.state, deliveryMode: o.deliveryMode, hasOpenDispute: o.hasOpenDispute });
          return (
            <div key={o.orderId} className="card">
              <div className="card-head">
                <h3>{o.eventName}</h3>
                <span className={ORDER_TONE[o.state]}>{orderStatusLabel(o.state)}</span>
              </div>
              <div className="muted money">{formatPanamaDateTime(o.startsAt)} · {formatUsd(o.priceCents)}</div>
              {o.state === 'transferencia_pendiente' && o.transferDeadline ? (
                <p className="notice">El vendedor tiene hasta {formatPanamaDateTime(o.transferDeadline)} para transferirte la entrada.</p>
              ) : null}
              <p>{step.text}</p>
              <div className="actions">
                {step.actions.includes('view_ticket') ? (
                  <a className="btn" href={`/api/orders/${o.orderId}/ticket`} target="_blank" rel="noopener noreferrer">Ver mi entrada</a>
                ) : null}
                {step.actions.includes('confirm_entry') ? (
                  <a className="btn accent" href={`/ingreso/${o.orderId}`}>Confirmar mi ingreso</a>
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

      <h2>Mis ventas</h2>
      {sales.length === 0 ? <p className="empty">Aún no tienes ventas.</p> : null}
      <div className="stack">
        {sales.map((s) => (
          <div key={s.orderId} className="card">
            <div className="card-head">
              <h3>{s.eventName}</h3>
              <span className={ORDER_TONE[s.state]}>{orderStatusLabel(s.state)}</span>
            </div>
            <div className="muted money">Recibirás {formatUsd(s.netCents)} (después de la comisión)</div>
            <p>{sellerNextStep({ state: s.state, deliveryMode: s.deliveryMode, payoutStatus: s.payoutStatus })}</p>
            {s.state === 'transferencia_pendiente' && s.transferDeadline ? (
              <p className="notice warning">Transfiere la entrada antes de {formatPanamaDateTime(s.transferDeadline)}.</p>
            ) : null}
          </div>
        ))}
      </div>

      <h2>Mis publicaciones</h2>
      {mine.length === 0 ? <p className="empty">No has publicado entradas. <a href="/vender">Vender una entrada</a></p> : null}
      <div className="stack">
        {mine.map((l) => (
          <div key={l.listingId} className="card offer">
            <div>
              <h3>{l.eventName}</h3>
              <div className="listing-meta">
                <span className="muted money">{formatUsd(l.askCents)}</span>
                <span className={LISTING_TONE[l.status]}>{listingStatusLabel(l.status)}</span>
              </div>
            </div>
            {l.status === 'pending' || l.status === 'verified' ? <WithdrawButton listingId={l.listingId} /> : null}
          </div>
        ))}
      </div>
    </main>
  );
}
