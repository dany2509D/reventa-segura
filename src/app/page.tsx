import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import HomeEvents, { type HomeEvent } from './_components/home-events';
import { IconOrders } from './_components/icons';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const events = await upcomingEvents(getDb());
  // Pre-formatted on the server so the client filter renders exactly the same text.
  const items: HomeEvent[] = events.map((e) => {
    const when = formatPanamaDateTime(e.startsAt); // "dd/mm/yyyy hh:mm"
    return {
      id: e.id,
      name: e.name,
      venue: e.venue,
      whenShort: `${when.slice(0, 5)} · ${when.slice(11)}`,
      day: when.slice(0, 5),
      from: e.fromCents === null ? null : formatUsd(e.fromCents),
      count: e.listingCount,
      resaleProhibited: e.resaleProhibited,
    };
  });
  return (
    <main className="page home">
      <div className="greeting-row">
        <h1 className="greeting">
          Hola <span aria-hidden="true">👋</span>
        </h1>
        <a className="icon-btn dark" href="/mis-ordenes" aria-label="Mis órdenes">
          <IconOrders />
        </a>
      </div>
      <p className="greeting-sub">Entradas de reventa con pago protegido.</p>
      <HomeEvents events={items} />
    </main>
  );
}
