import { describe, expect, it } from 'vitest';
import { buildHomeData, eventCountLabel, pickFeatured, ticketCountLabel, toEventView, type EventRow } from './view-model';

const row = (n: number, over: Partial<EventRow> = {}): EventRow => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  name: `Evento ${n}`,
  venue: `Lugar ${n}`,
  startsAt: new Date(Date.UTC(2026, 10, 20 + n, 1, 0)), // 20:00 the evening before, in Panama
  resaleProhibited: false,
  fromCents: 5000 + n * 100,
  listingCount: 2,
  ...over,
});

describe('toEventView', () => {
  it('formats the price and the Panama date once, on the server', () => {
    const v = toEventView(row(1));
    expect(v.from).toBe('$51.00');
    expect(v.count).toBe(2);
    expect(v.dateShort).toBe('vie 20 nov · 20:00');
    expect(v.dateLong).toBe('viernes 20 de noviembre de 2026, 20:00');
    expect(v.date.iso).toBe('2026-11-20T20:00-05:00');
  });

  it('shows no price and no tickets when nothing is on sale', () => {
    expect(toEventView(row(1, { fromCents: null, listingCount: 0 }))).toMatchObject({ from: null, count: 0 });
  });

  it('never advertises tickets for an event whose organiser prohibits resale', () => {
    expect(toEventView(row(1, { resaleProhibited: true }))).toMatchObject({ from: null, count: 0, resaleProhibited: true });
  });
});

describe('pickFeatured', () => {
  it('prefers the soonest events with tickets on sale, at most three', () => {
    const events = [row(1, { listingCount: 0, fromCents: null }), row(2), row(3), row(4), row(5)].map(toEventView);
    const { featured, haveTickets } = pickFeatured(events);
    expect(featured.map((e) => e.name)).toEqual(['Evento 2', 'Evento 3', 'Evento 4']);
    expect(haveTickets).toBe(true);
  });

  it('falls back to the soonest events when nothing is on sale, and says so', () => {
    const events = [row(1, { listingCount: 0, fromCents: null }), row(2, { listingCount: 0, fromCents: null })].map(toEventView);
    const { featured, haveTickets } = pickFeatured(events);
    expect(featured.map((e) => e.name)).toEqual(['Evento 1', 'Evento 2']);
    expect(haveTickets).toBe(false);
  });

  it('features nothing when there are no events (no invented cards)', () => {
    expect(pickFeatured([])).toEqual({ featured: [], haveTickets: false });
  });
});

describe('buildHomeData', () => {
  it('keeps the chronological order, picks the soonest event for the hero and counts real listings', () => {
    const data = buildHomeData([row(1), row(2, { listingCount: 3 }), row(3, { resaleProhibited: true })]);
    expect(data.events.map((e) => e.name)).toEqual(['Evento 1', 'Evento 2', 'Evento 3']);
    expect(data.next?.name).toBe('Evento 1');
    expect(data.totals).toEqual({ events: 3, listings: 5 });
    expect(data.featured.map((e) => e.name)).toEqual(['Evento 1', 'Evento 2']);
  });

  it('handles an empty catalogue', () => {
    expect(buildHomeData([])).toEqual({ events: [], featured: [], featuredHaveTickets: false, next: null, totals: { events: 0, listings: 0 } });
  });
});

describe('labels', () => {
  it('uses the singular for one', () => {
    expect(ticketCountLabel(1)).toBe('1 entrada');
    expect(ticketCountLabel(3)).toBe('3 entradas');
    expect(eventCountLabel(1)).toBe('1 evento');
    expect(eventCountLabel(0)).toBe('0 eventos');
  });
});
