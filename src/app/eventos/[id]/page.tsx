import { notFound } from 'next/navigation';
import { eventDetail } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { listVerifiedListings } from '@/lib/tickets/listings';
import BackLink from '../../_components/back-link';
import { DoodlePanel, TicketDoodle, toneFor } from '../../_components/doodle';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const event = await eventDetail(db, id);
  if (!event || event.status !== 'active') notFound();
  const offers = event.resaleProhibited ? [] : await listVerifiedListings(db, id);
  const tone = toneFor(event.id);
  return (
    <main className="page">
      <BackLink href="/">Todos los eventos</BackLink>
      <DoodlePanel tone={tone} />
      <header className="page-head">
        <h1>{event.name}</h1>
        <div className="tags">
          <span className="tag">{event.venue}</span>
          <span className="tag">{formatPanamaDateTime(event.startsAt)}</span>
        </div>
      </header>
      <p>Valor original de la entrada: <strong className="money">{formatUsd(event.faceValueCents)}</strong></p>

      {event.resaleProhibited ? (
        <p className="notice warning">El organizador de este evento prohíbe la reventa de entradas, por eso no vendemos entradas de este evento.</p>
      ) : (
        <>
          <p className="notice">
            Algunas boleteras o recintos pueden restringir las entradas revendidas. Si te rechazan en la puerta, abre una disputa y te reembolsamos.
          </p>
          <h2>Entradas disponibles</h2>
          {offers.length === 0 ? (
            <div className={`empty tone-${tone}`}>
              <TicketDoodle />
              <p>No hay entradas publicadas por ahora.</p>
            </div>
          ) : null}
          <div className="stack">
            {offers.map((o) => (
              <div key={o.id} className="card offer">
                <div>
                  <div className="price">{formatUsd(o.askCents)}</div>
                  <div className="tags">
                    <span className="tag">
                      {o.deliveryMode === 'transfer' ? 'Te la transfieren en la boletera' : 'Recibes la entrada en la app'}
                    </span>
                  </div>
                </div>
                <a className="btn accent" href={`/comprar/${o.id}`}>Comprar</a>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
