'use client';

import { useState } from 'react';
import { searchEvents } from '@/lib/ui/search';
import EmptyState from '../_components/empty-state';
import EventPoster from '../_components/event-poster';
import { IconArrowRight, IconPin } from '../_components/icons';
import { HoverCard, StaggerGrid, StaggerItem } from '../_components/motion-primitives';
import { useSearch } from './search-context';
import { eventCountLabel, type EventView } from './view-model';

/** Rows shown before "show all": enough to scan, short enough not to bury the rest of the page. */
const PAGE_SIZE = 8;

/**
 * Section 02: the full agenda as compact rows (date, poster thumbnail, name, venue, price), in
 * date order. A list rather than a carousel: every event stays reachable with the keyboard and
 * the page never fakes a carousel around two items. The hero's search box filters it.
 */
export default function EventAgenda({ events }: { events: EventView[] }) {
  const { query, setQuery } = useSearch();
  const [expanded, setExpanded] = useState(false);
  const shown = searchEvents(events, query);
  const visible = expanded || query !== '' ? shown : shown.slice(0, PAGE_SIZE);
  const hidden = shown.length - visible.length;

  return (
    <section className="section container" id="eventos" aria-labelledby="eventos-title">
      <header className="section-head reveal">
        <p className="eyebrow">
          <span className="idx">02</span> Agenda
        </p>
        <h2 id="eventos-title" className="section-title-xl" tabIndex={-1}>
          {query === '' ? 'Próximos eventos' : 'Resultados'}
        </h2>
        <p className="section-desc">
          {query === ''
            ? events.length === 0
              ? 'Aquí aparecerán los eventos en cuanto se publiquen.'
              : `${eventCountLabel(events.length)} en orden de fecha. Entra a uno para ver las entradas publicadas.`
            : `${shown.length} de ${eventCountLabel(events.length)} para «${query}».`}
        </p>
        {query !== '' ? (
          <button type="button" className="section-link" onClick={() => setQuery('')}>
            Ver todos los eventos
            <IconArrowRight />
          </button>
        ) : null}
      </header>

      {events.length === 0 ? (
        <EmptyState>
          <p>Todavía no hay eventos disponibles.</p>
          <p className="muted">Cuando el equipo publique un evento, lo verás aquí con sus entradas.</p>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>
          <p>No encontramos eventos para «{query}».</p>
          <p className="muted">Prueba con otro nombre de evento o de lugar.</p>
          <button type="button" className="btn sm secondary" onClick={() => setQuery('')}>
            Ver todos los eventos
          </button>
        </EmptyState>
      ) : (
        <StaggerGrid as="ol" className="agenda" stagger={0.05}>
          {visible.map((event) => (
            <StaggerItem as="li" key={event.id} className="agenda-item">
              <HoverCard className="agenda-hover">
              <a className="agenda-row" href={`/eventos/${event.id}`} data-card="">
                <time className="agenda-date" dateTime={event.date.iso}>
                  <b>{event.date.day}</b>
                  <span>{event.date.month}</span>
                </time>
                <span className="agenda-art">
                  <EventPoster seed={event.id} title={event.name} size="thumb" />
                </span>
                <span className="agenda-main">
                  <span className="agenda-when">
                    <span className="agenda-when-date">
                      {event.date.day} {event.date.month} ·{' '}
                    </span>
                    {event.date.weekday} · {event.date.time}
                  </span>
                  <span className="agenda-name">{event.name}</span>
                  <span className="agenda-venue">
                    <IconPin />
                    {event.venue}
                  </span>
                </span>
                <span className="agenda-tags">
                  {event.from ? (
                    <>
                      <span className="tag agenda-price">Desde {event.from}</span>
                      <span className="tag">{event.count <= 2 ? 'Últimas entradas' : `${event.count} entradas disponibles`}</span>
                    </>
                  ) : (
                    <span className="tag">{event.resaleProhibited ? 'Reventa no permitida' : 'Sin entradas por ahora'}</span>
                  )}
                </span>
                <span className="round-arrow" aria-hidden="true">
                  <IconArrowRight />
                </span>
              </a>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerGrid>
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
