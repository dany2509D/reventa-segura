import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const events = await upcomingEvents(getDb());
  return (
    <main className="page">
      <h1>Entradas de reventa con pago protegido</h1>
      <p className="muted">
        Pagas hoy, pero el vendedor cobra solo cuando tú entras al evento. Si algo sale mal, te devolvemos tu dinero.
      </p>
      {events.length === 0 ? <p>Todavía no hay eventos disponibles.</p> : null}
      <div className="stack">
        {events.map((e) => (
          <a key={e.id} href={`/eventos/${e.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <h3>{e.name}</h3>
            <div className="muted">{e.venue} · {formatPanamaDateTime(e.startsAt)}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="price">{e.fromCents === null ? 'Sin entradas por ahora' : `Desde ${formatUsd(e.fromCents)}`}</span>
              {e.listingCount > 0 ? <span className="badge">{e.listingCount} {e.listingCount === 1 ? 'entrada' : 'entradas'}</span> : null}
            </div>
            {e.resaleProhibited ? <p className="notice" style={{ marginTop: 8 }}>El organizador prohíbe la reventa de este evento.</p> : null}
          </a>
        ))}
      </div>
    </main>
  );
}
