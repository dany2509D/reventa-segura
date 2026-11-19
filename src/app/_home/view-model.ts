import { formatUsd } from '@/lib/format';
import { longDateLabel, panamaDateParts, shortDateLabel, type DateParts } from '@/lib/ui/dates';

/** One row of `upcomingEvents` (src/lib/account/queries.ts): the only data the home page has. */
export type EventRow = {
  id: string;
  name: string;
  venue: string;
  startsAt: Date;
  resaleProhibited: boolean;
  fromCents: number | null;
  listingCount: number;
};

/** What the cards, the agenda and the search render. Plain serialisable data, formatted once on
 *  the server so client components print exactly the same text (no hydration mismatch). */
export type EventView = {
  id: string;
  name: string;
  venue: string;
  date: DateParts;
  /** "sáb 7 nov · 20:00" */
  dateShort: string;
  /** "sábado 7 de noviembre de 2026, 20:00" */
  dateLong: string;
  /** Cheapest verified listing ("$150.00"), or null when there is none. */
  from: string | null;
  /** Numeric price of the cheapest listing in cents (for pure deterministic price filters). */
  fromCents: number | null;
  /** Verified listings on sale. */
  count: number;
  resaleProhibited: boolean;
};

export type HomeData = {
  /** Every upcoming event, soonest first (the order of the query). */
  events: EventView[];
  /** Up to three events for the large cards. */
  featured: EventView[];
  /** True when the featured events all have tickets on sale (drives the section's wording). */
  featuredHaveTickets: boolean;
  /** The event the hero poster shows: the first featured one (on sale when any is). */
  hero: EventView | null;
  /** The soonest event, for the hero ticket. */
  next: EventView | null;
  totals: { events: number; listings: number };
};

export function toEventView(row: EventRow): EventView {
  const date = panamaDateParts(row.startsAt);
  const onSale = !row.resaleProhibited && row.fromCents !== null && row.listingCount > 0;
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    date,
    dateShort: shortDateLabel(date),
    dateLong: longDateLabel(date),
    from: onSale && row.fromCents !== null ? formatUsd(row.fromCents) : null,
    fromCents: onSale ? row.fromCents : null,
    count: onSale ? row.listingCount : 0,
    resaleProhibited: row.resaleProhibited,
  };
}

export const FEATURED_MAX = 3;

/**
 * The featured events: the soonest ones that have tickets on sale. When nothing is on sale yet,
 * the soonest events are shown instead (and the section says so). Never more than three, never
 * an event that is not in the list.
 */
export function pickFeatured(events: readonly EventView[], max = FEATURED_MAX): { featured: EventView[]; haveTickets: boolean } {
  const onSale = events.filter((e) => e.count > 0);
  if (onSale.length > 0) return { featured: onSale.slice(0, max), haveTickets: true };
  return { featured: events.slice(0, max), haveTickets: false };
}

export function buildHomeData(rows: readonly EventRow[]): HomeData {
  const events = rows.map(toEventView);
  const { featured, haveTickets } = pickFeatured(events);
  return {
    events,
    featured,
    featuredHaveTickets: haveTickets,
    hero: featured[0] ?? null,
    next: events[0] ?? null,
    totals: { events: events.length, listings: events.reduce((sum, e) => sum + e.count, 0) },
  };
}

/** "1 entrada" / "3 entradas" */
export function ticketCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'entrada' : 'entradas'}`;
}

/** "1 evento" / "4 eventos" */
export function eventCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}
