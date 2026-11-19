'use client';

import { useState } from 'react';
import { eventCoverImage } from '@/lib/ui/event-cover';
import { searchEvents } from '@/lib/ui/search';
import EmptyState from '../_components/empty-state';
import EventPoster from '../_components/event-poster';
import { IconArrowRight, IconGrid, IconList } from '../_components/icons';
import { useSearch } from './search-context';
import { eventCountLabel, ticketCountLabel, type EventView } from './view-model';

const PAGE_SIZE = 12;
type AgendaFilter = 'all' | 'available' | 'under50' | 'under100';
type ViewMode = 'grid' | 'list';

const FILTERS: { id: AgendaFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'available', label: 'Con entradas' },
  { id: 'under50', label: 'Hasta $50' },
  { id: 'under100', label: 'Hasta $100' },
];

function applyFilter(events: readonly EventView[], filter: AgendaFilter): EventView[] {
  if (filter === 'available') return events.filter((e) => e.count > 0);
  if (filter === 'under50') return events.filter((e) => e.count > 0 && e.fromCents !== null && e.fromCents <= 5000);
  if (filter === 'under100') return events.filter((e) => e.count > 0 && e.fromCents !== null && e.fromCents <= 10000);
  return [...events];
}

/**
 * Full events catalog & agenda directory. Supports a 3-column visual photography grid (`grid`) and
 * chronological schedule list (`list`) alongside instant availability and budget filters.
 */
export default function EventAgenda({
  events,
  defaultView = 'list',
  showViewToggle = false,
  showHeader = true,
}: {
  events: EventView[];
  defaultView?: ViewMode;
  showViewToggle?: boolean;
  showHeader?: boolean;
}) {
  const { query, setQuery } = useSearch();
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const [view, setView] = useState<ViewMode>(defaultView);
  const [expanded, setExpanded] = useState(false);
  const searched = searchEvents(events, query);
  const shown = applyFilter(searched, filter);
  const hasActiveFilter = query !== '' || filter !== 'all';
  const visible = expanded || hasActiveFilter ? shown : shown.slice(0, PAGE_SIZE);
  const hidden = shown.length - visible.length;

  function resetAll() {
    setQuery('');
    setFilter('all');
  }

  return (
    <section className={showHeader ? 'section container' : ''} id="eventos" aria-labelledby="eventos-title">
      {showHeader ? (
        <header className="section-head reveal">
          <p className="eyebrow">
            <span className="idx">02</span> Agenda
          </p>
          <h2 id="eventos-title" className="section-title-xl" tabIndex={-1}>
            {query === '' ? 'Próximos eventos' : 'Resultados'}
          </h2>
          <p className="section-desc">
            {!hasActiveFilter
              ? events.length === 0
                ? 'Aquí aparecerán los eventos en cuanto se publiquen.'
                : `${eventCountLabel(events.length)} en orden de fecha. Entra a uno para ver las entradas publicadas.`
              : `${shown.length} de ${eventCountLabel(events.length)}${query !== '' ? ` para «${query}»` : ''}.`}
          </p>
          {hasActiveFilter ? (
            <button type="button" className="section-link" onClick={resetAll}>
              Ver todos los eventos
              <IconArrowRight />
            </button>
          ) : null}
        </header>
      ) : null}

      {events.length > 0 ? (
        <div className="catalog-meta">
          <div className="agenda-filters" role="group" aria-label="Filtrar eventos">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="filter-pill"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {showViewToggle ? (
            <div className="view-switch" role="group" aria-label="Vista de cartelera">
              <button
                type="button"
                className="view-btn"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <IconGrid />
                <span>Tarjetas</span>
              </button>
              <button
                type="button"
                className="view-btn"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <IconList />
                <span>Lista</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {events.length === 0 ? (
        <EmptyState>
          <p>Todavía no hay eventos disponibles.</p>
          <p className="muted">Cuando el equipo publique un evento, lo verás aquí con sus entradas.</p>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>
          <p>{query !== '' ? `No encontramos eventos para «${query}».` : 'No hay eventos que coincidan con este filtro.'}</p>
          <p className="muted">Prueba con otro criterio o vuelve a ver toda la cartelera.</p>
          <button type="button" className="btn sm secondary" onClick={resetAll}>
            Ver todos los eventos
          </button>
        </EmptyState>
      ) : view === 'grid' ? (
        <div className="catalog-grid" key={`grid-${filter}-${query}`}>
          {visible.map((event, i) => (
            <a key={event.id} className="feature-card" href={`/eventos/${event.id}`} data-card="">
              <div className="feature-art">
                <EventPoster
                  seed={event.id}
                  title={event.name}
                  image={eventCoverImage(event.id, event.name, event.venue)}
                  size="feature"
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                  priority={i < 3}
                />
              </div>
              <div className="feature-body">
                <h2 className="feature-name">{event.name}</h2>
                <p className="feature-meta">
                  {event.from ? (
                    <>
                      <strong>{event.from}</strong>
                      {' · '}
                      {event.venue}
                    </>
                  ) : (
                    <span>{event.venue}</span>
                  )}
                </p>
                <div className="feature-foot">
                  <time className="feature-date mono" dateTime={event.date.iso}>
                    {event.dateShort}
                  </time>
                  {event.count > 0 ? (
                    <span className="feature-status">
                      <span className="dot-live" aria-hidden="true" />
                      <span className="art-pill">{ticketCountLabel(event.count)}</span>
                    </span>
                  ) : (
                    <span className="feature-none">{event.resaleProhibited ? 'Sin reventa' : 'Sin entradas'}</span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <ol className="agenda" key={`list-${filter}-${query}`}>
          {visible.map((event) => (
            <li key={event.id} className="agenda-item">
              <a className="agenda-row" href={`/eventos/${event.id}`} data-card="">
                <time className="agenda-date" dateTime={event.date.iso}>
                  <b>{event.date.day}</b>
                  <span>{event.date.month}</span>
                </time>
                <span className="agenda-art">
                  <EventPoster
                    seed={event.id}
                    title={event.name}
                    image={eventCoverImage(event.id, event.name, event.venue)}
                    size="thumb"
                    sizes="80px"
                  />
                </span>
                <span className="agenda-main">
                  <span className="agenda-when">
                    <span className="agenda-when-date">
                      {event.date.day} {event.date.month} ·{' '}
                    </span>
                    {event.date.weekday} · {event.date.time}
                  </span>
                  <span className="agenda-name">{event.name}</span>
                  <span className="agenda-venue">{event.venue}</span>
                </span>
                <span className="agenda-tags">
                  {event.from ? (
                    <>
                      <span className="tag agenda-price">Desde {event.from}</span>
                      <span className="tag">{ticketCountLabel(event.count)}</span>
                    </>
                  ) : (
                    <span className="tag">{event.resaleProhibited ? 'Reventa no permitida' : 'Sin entradas por ahora'}</span>
                  )}
                </span>
                <span className="round-arrow" aria-hidden="true">
                  <IconArrowRight />
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}

      {hidden > 0 ? (
        <div className="agenda-more">
          <button type="button" className="btn outline" onClick={() => setExpanded(true)}>
            Mostrar los {shown.length} eventos
          </button>
        </div>
      ) : null}
    </section>
  );
}
