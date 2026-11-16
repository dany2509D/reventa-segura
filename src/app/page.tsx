import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { IconArrowRight } from './_components/icons';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const events = await upcomingEvents(getDb());
  return (
    <main className="page">
      <section className="hero">
        <h1>Entradas de reventa con pago protegido</h1>
        <p className="lead">
          Pagas hoy, pero el vendedor cobra solo cuando tú entras al evento. Si algo sale mal, te devolvemos tu dinero.
        </p>
      </section>
      {events.length === 0 ? <p className="empty">Todavía no hay eventos disponibles.</p> : null}
      <div className="event-list">
        {events.map((e, i) => (
          <a key={e.id} href={`/eventos/${e.id}`} className={i === 0 ? 'event-card feature' : 'event-card'}>
            <div className="tags">
              <span className="tag">{formatPanamaDateTime(e.startsAt)}</span>
            </div>
            <h3>{e.name}</h3>
            <div className="muted">{e.venue}</div>
            <div className="event-card-foot">
              <div className="event-card-price">
                {e.fromCents === null ? (
                  <span className="price-label">Sin entradas por ahora</span>
                ) : (
                  <span className="price">
                    <span className="price-label">Desde</span> {formatUsd(e.fromCents)}
                  </span>
                )}
                {e.listingCount > 0 ? (
                  <span className="chip neutral">{e.listingCount} {e.listingCount === 1 ? 'entrada' : 'entradas'}</span>
                ) : null}
              </div>
              <span className="round-action" aria-hidden="true">
                <IconArrowRight />
              </span>
            </div>
            {e.resaleProhibited ? <p className="notice warning">El organizador prohíbe la reventa de este evento.</p> : null}
          </a>
        ))}
      </div>
    </main>
  );
}
