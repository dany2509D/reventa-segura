// Pure search over the events already loaded on the page (no network, no invented results).
// Accent- and case-insensitive; every word of the query must match the name or the venue.

export type Searchable = { name: string; venue: string };

/** Lower-case, accent-free, single-spaced text for comparing ("Panamá  vs" → "panama vs"). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The words of a query, normalised; an empty query has no terms. */
export function queryTerms(query: string): string[] {
  const q = normalizeText(query);
  return q ? q.split(' ') : [];
}

// Lower is better. A term that starts the name beats one that starts any word, which beats one
// found inside a word; the venue ranks below the name.
function termScore(term: string, name: string, venue: string): number | null {
  if (name.startsWith(term)) return 0;
  if (name.split(' ').some((w) => w.startsWith(term))) return 1;
  if (name.includes(term)) return 2;
  if (venue.split(' ').some((w) => w.startsWith(term))) return 3;
  if (venue.includes(term)) return 4;
  return null;
}

/**
 * Filters and ranks `items` for `query`. An empty query returns the items untouched (same order).
 * The sort is stable, so equally good matches keep their original (chronological) order.
 */
export function searchEvents<T extends Searchable>(items: readonly T[], query: string): T[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [...items];
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const name = normalizeText(item.name);
    const venue = normalizeText(item.venue);
    let score = 0;
    for (const term of terms) {
      const s = termScore(term, name, venue);
      if (s === null) return;
      score += s;
    }
    scored.push({ item, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}

/** Index of the option the arrow keys move to; wraps around, -1 means "nothing active". */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
