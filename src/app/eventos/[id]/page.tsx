import { notFound } from 'next/navigation';
import { eventDetail } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { listVerifiedListings } from '@/lib/tickets/listings';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const event = await eventDetail(db, id);
  if (!event || event.status !== 'active') notFound();
  const offers = event.resaleProhibited ? [] : await listVerifiedListings(db, id);
  return (
    <main className="page">
      <a href="/" className="muted">← Todos los eventos</a>
      <h1>{event.name}</h1>
      <p className="muted">{event.venue} · {formatPanamaDateTime(event.startsAt)}</p>
      <p>Valor original de la entrada: <strong>{formatUsd(event.faceValueCents)}</strong></p>

      {event.resaleProhibited ? (
        <p className="notice">El organizador de este evento prohíbe la reventa de entradas, por eso no vendemos entradas de este evento.</p>
      ) : (
        <>
          <p className="notice">
            Algunas boleteras o recintos pueden restringir las entradas revendidas. Si te rechazan en la puerta, abre una disputa y te reembolsamos.
          </p>
          <h2>Entradas disponibles</h2>
          {offers.length === 0 ? <p>No hay entradas publicadas por ahora.</p> : null}
          <div className="stack">
            {offers.map((o) => (
              <div key={o.id} className="card row">
                <div>
                  <div className="price">{formatUsd(o.askCents)}</div>
                  <div className="muted">
                    {o.deliveryMode === 'transfer' ? 'Te la transfieren en la boletera' : 'Recibes la entrada en la app'}
                  </div>
                </div>
                <a className="btn" href={`/comprar/${o.id}`}>Comprar</a>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
