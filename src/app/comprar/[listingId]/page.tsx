import { notFound } from 'next/navigation';
import { listingOffer } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatUsd } from '@/lib/format';
import { longDateLabel, panamaDateParts } from '@/lib/ui/dates';
import BackLink from '../../_components/back-link';
import EventPoster from '../../_components/event-poster';
import { IconShieldCheck } from '../../_components/icons';
import { TestModeNotice } from '../../_components/test-mode';
import { requireUser } from '../../session';
import BuyButton from './buy-button';

export const metadata = { title: 'Confirmar compra' };
export const dynamic = 'force-dynamic';

export default async function BuyPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const user = await requireUser(`/comprar/${listingId}`);
  const offer = await listingOffer(getDb(), listingId);
  if (!offer || offer.resaleProhibited) notFound();
  const own = offer.sellerId === user.userId;
  const date = panamaDateParts(offer.startsAt);
  return (
    <main className="page wide buy-page">
      <BackLink href={`/eventos/${offer.eventId}`}>{offer.eventName}</BackLink>
      <header className="page-head">
        <p className="eyebrow">Paso 1 de 2 · Revisa</p>
        <h1>Confirmar compra</h1>
      </header>
      <div className="buy-layout">
        {/* The purchase as a ticket: event on the body, price on the stub */}
        <section className="ticket summary" aria-labelledby="resumen-title">
          <div className="summary-art">
            <EventPoster seed={offer.eventId} title={offer.eventName} size="card" />
          </div>
          <div className="ticket-main">
            <h2 id="resumen-title">{offer.eventName}</h2>
            <dl className="facts">
              <div>
                <dt>Lugar</dt>
                <dd>{offer.venue}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>
                  <time dateTime={date.iso}>{longDateLabel(date)}</time>
                </dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>
                  {offer.deliveryMode === 'transfer'
                    ? 'El vendedor te transfiere la entrada en la boletera (Panatickets, Ticketplus u otra).'
                    : 'Verás tu entrada aquí mismo después de pagar.'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="ticket-stub">
            <span className="price-label">Total a pagar</span>
            <p className="price price-lg">{formatUsd(offer.askCents)}</p>
          </div>
        </section>

        <div className="buy-side">
          <section className="protect on-scrim" aria-labelledby="proteccion-title">
            <div className="protect-head">
              <span className="protect-icon" aria-hidden="true">
                <IconShieldCheck />
              </span>
              <h2 id="proteccion-title">Qué pasa con tu pago</h2>
            </div>
            <ol className="checklist">
              <li>Se retiene: no pasa al vendedor mientras se completa la entrega.</li>
              <li>Se libera al vendedor cuando cierra el plazo de reportes, 12 horas después del inicio del evento.</li>
              <li>Si reportas un problema dentro de ese plazo, el equipo lo revisa y, si procede, te devuelve el dinero.</li>
            </ol>
            <p className="protect-note">
              Una boletera o recinto puede restringir entradas revendidas. Si te rechazan en la puerta, abre una disputa.
            </p>
          </section>
          {own ? (
            <p className="notice">Esta es tu propia publicación: no puedes comprarla.</p>
          ) : (
            <div className="sticky-cta">
              <TestModeNotice short />
              <BuyButton listingId={listingId} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
