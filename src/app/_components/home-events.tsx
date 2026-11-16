'use client';

import { useState } from 'react';
import { TicketDoodle, type Tone } from './doodle';
import { IconArrowRight, IconChevronRight, IconSearch } from './icons';

export type HomeEvent = {
  id: string;
  name: string;
  venue: string;
  whenShort: string;
  day: string;
  from: string | null;
  count: number;
  resaleProhibited: boolean;
};

// The list alternates colours like the reference; event heroes keep a per-event tone (toneFor).
const LIST_TONES: Tone[] = ['sky', 'mint', 'pink'];

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Home: search pill (filters the already-loaded events by name or venue), two feature tiles
 *  and the "Próximos eventos" sheet of pastel cards. No data fetching here. */
export default function HomeEvents({ events }: { events: HomeEvent[] }) {
  const [q, setQ] = useState('');
  const query = normalize(q.trim());
  const shown = query ? events.filter((e) => normalize(`${e.name} ${e.venue}`).includes(query)) : events;
  const [first, second] = events;

  return (
    <>
      <label className="search">
        <span className="visually-hidden">Buscar eventos</span>
        <IconSearch />
        <input
          type="search"
          placeholder="Buscar eventos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      {!query && first ? (
        <div className="tiles">
          <Tile event={first} dark />
          {second ? <Tile event={second} /> : <HowItWorks />}
        </div>
      ) : null}

      <section className="sheet" aria-labelledby="proximos">
        <div className="sheet-head">
          <h2 id="proximos">{query ? 'Resultados' : 'Próximos eventos'}</h2>
          {query ? (
            <button type="button" className="see-all" onClick={() => setQ('')}>
              Ver todo
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
          ) : (
            <a className="see-all" href="#proximos">
              Ver todo
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </a>
          )}
        </div>
        {events.length === 0 ? (
          <div className="empty tone-sky">
            <TicketDoodle />
            <p>Todavía no hay eventos disponibles.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty tone-pink">
            <TicketDoodle />
            <p>No encontramos eventos con esa búsqueda.</p>
          </div>
        ) : (
          <div className="event-list">
            {shown.map((e, i) => (
              <a key={e.id} href={`/eventos/${e.id}`} className={`event-card pastel tone-${LIST_TONES[i % LIST_TONES.length]}`}>
                <div className="event-card-body">
                  <h3>{e.name}</h3>
                  <div className="tags">
                    <span className="tag">{e.whenShort}</span>
                    <span className="tag">{e.from === null ? 'Sin entradas por ahora' : `Desde ${e.from}`}</span>
                    {e.count > 0 ? <span className="tag">{e.count} {e.count === 1 ? 'entrada' : 'entradas'}</span> : null}
                    {e.resaleProhibited ? <span className="tag">Reventa prohibida</span> : null}
                  </div>
                </div>
                <span className="round-action light" aria-hidden="true">
                  <IconArrowRight />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Tile({ event, dark = false }: { event: HomeEvent; dark?: boolean }) {
  return (
    <a href={`/eventos/${event.id}`} className={dark ? 'tile feature' : 'tile'}>
      <h3>{event.name}</h3>
      <span className="tile-pill">
        <span>{event.day}</span>
        <span className="round-action" aria-hidden="true">
          <IconArrowRight />
        </span>
      </span>
    </a>
  );
}

function HowItWorks() {
  return (
    <div className="tile pastel tone-mint">
      <h3>Cómo funciona</h3>
      <ul className="how-list">
        <li>Pagas protegido</li>
        <li>El vendedor cobra cuando entras</li>
        <li>Reembolso si falla</li>
      </ul>
    </div>
  );
}
