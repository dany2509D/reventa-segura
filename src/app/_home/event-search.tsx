'use client';

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { motionAllowed } from '@/lib/ui/motion';
import { moveActive, searchEvents } from '@/lib/ui/search';
import EventPoster from '../_components/event-poster';
import { IconArrowDown, IconClose, IconSearch } from '../_components/icons';
import { useSearch } from './search-context';
import { eventCountLabel, type EventView } from './view-model';

const SUGGESTION_LIMIT = 5;
/** The dropdown filters on every keystroke (in-memory, instant); committing the query to the
 *  agenda below and announcing the count to screen readers is debounced. */
const COMMIT_DELAY_MS = 180;

/**
 * Search box of the hero: an ARIA combobox over the events already on the page (real data only,
 * nothing fetched, nothing invented).
 *  - Focus shows the available events; typing filters them by name or venue, accents ignored.
 *  - ↓/↑ move through the options, Enter opens the active one, Esc closes (then clears).
 *  - Enter without an active option jumps to the agenda, filtered by the query.
 *  - "/" focuses the box from anywhere on the page.
 */
export default function EventSearch({ events }: { events: EventView[] }) {
  const { setQuery } = useSearch();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;

  const query = text.trim();
  const matches = useMemo(() => searchEvents(events, query), [events, query]);
  const options = matches.slice(0, SUGGESTION_LIMIT);
  const matchCount = matches.length;
  const showPanel = open && (events.length > 0 || query !== '');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(query);
      setAnnouncement(query === '' ? '' : matchCount === 0 ? `Sin resultados para ${query}` : `${eventCountLabel(matchCount)} para ${query}`);
    }, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, matchCount, setQuery]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${uid}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, uid]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    setText('');
    setQuery('');
    setActive(-1);
    inputRef.current?.focus();
  }

  /** Jump to the agenda (already filtered by the query) and move focus to its heading. */
  function showInAgenda(nextQuery: string) {
    setQuery(nextQuery);
    close();
    const section = document.getElementById('eventos');
    if (!section) return;
    section.scrollIntoView({ behavior: motionAllowed(window) ? 'smooth' : 'auto', block: 'start' });
    document.getElementById('eventos-title')?.focus({ preventScroll: true });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((current) => moveActive(open ? current : -1, e.key === 'ArrowDown' ? 1 : -1, options.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showPanel && active >= 0) document.getElementById(optionId(active))?.click();
      else if (events.length > 0) showInAgenda(query);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      } else if (text !== '') {
        e.preventDefault();
        clear();
      }
    }
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    close();
  }

  return (
    <div ref={rootRef} className="search" data-open={showPanel || undefined} onBlur={onBlur}>
      <label className="visually-hidden" htmlFor={inputId}>
        Buscar eventos por nombre o lugar
      </label>
      <div className="search-field">
        <IconSearch />
        <input
          ref={inputRef}
          id={inputId}
          className="search-input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          placeholder="Busca un evento o un lugar"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {text !== '' ? (
          <button type="button" className="search-clear" aria-label="Borrar búsqueda" onClick={clear}>
            <IconClose />
          </button>
        ) : (
          <kbd className="search-kbd" aria-hidden="true">/</kbd>
        )}
      </div>

      {showPanel ? (
        <div className="search-panel">
          {matchCount > 0 ? (
            <>
              <p className="search-label eyebrow">{query === '' ? 'Eventos disponibles' : matchCount === 1 ? '1 resultado' : `${matchCount} resultados`}</p>
              <ul id={listId} className="search-options" role="listbox" aria-label="Eventos">
                {options.map((e, i) => (
                  <li key={e.id} role="presentation">
                    <a
                      id={optionId(i)}
                      className="search-option"
                      role="option"
                      aria-selected={i === active}
                      tabIndex={-1}
                      href={`/eventos/${e.id}`}
                      data-card=""
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="search-option-art">
                        <EventPoster seed={e.id} title={e.name} size="thumb" />
                      </span>
                      <span className="search-option-main">
                        <span className="search-option-name">{e.name}</span>
                        <span className="search-option-meta">
                          {e.dateShort} · {e.venue}
                        </span>
                      </span>
                      <span className="search-option-price">{e.from ?? 'Sin entradas'}</span>
                    </a>
                  </li>
                ))}
              </ul>
              {query !== '' || matchCount > options.length ? (
                <button type="button" className="search-all" onClick={() => showInAgenda(query)}>
                  {query === '' ? `Ver los ${matchCount} eventos` : matchCount === 1 ? 'Ver en la agenda' : `Ver los ${matchCount} en la agenda`}
                  <IconArrowDown />
                </button>
              ) : null}
            </>
          ) : (
            <div className="search-empty">
              <ul id={listId} role="listbox" aria-label="Eventos" hidden />
              <p className="search-empty-title">Sin resultados para «{query}»</p>
              <p className="muted">
                {events.length === 0 ? 'Todavía no hay eventos publicados.' : 'Prueba con otro nombre de evento o de lugar.'}
              </p>
              {events.length > 0 ? (
                <button
                  type="button"
                  className="btn sm secondary"
                  onClick={() => {
                    setText('');
                    showInAgenda('');
                  }}
                >
                  Ver todos los eventos
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <ul id={listId} role="listbox" aria-label="Eventos" hidden />
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
