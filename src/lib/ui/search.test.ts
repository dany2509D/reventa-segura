import { describe, expect, it } from 'vitest';
import { moveActive, normalizeText, queryTerms, searchEvents } from './search';

const EVENTS = [
  { id: 'a', name: 'Concierto Bad Bunny', venue: 'Estadio Rommel Fernández' },
  { id: 'b', name: 'Panamá vs Costa Rica', venue: 'Estadio Rod Carew' },
  { id: 'c', name: 'Festival de Jazz', venue: 'Ciudad del Saber' },
  { id: 'd', name: 'Rod Stewart en vivo', venue: 'Centro de Convenciones Amador' },
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('normalizeText', () => {
  it('drops accents, case, punctuation and repeated spaces', () => {
    expect(normalizeText('  Panamá   vs. COSTA-Rica ')).toBe('panama vs costa rica');
    expect(normalizeText('Ñandú')).toBe('nandu');
  });
});

describe('queryTerms', () => {
  it('returns no terms for an empty or punctuation-only query', () => {
    expect(queryTerms('')).toEqual([]);
    expect(queryTerms('   ')).toEqual([]);
    expect(queryTerms('--')).toEqual([]);
  });
});

describe('searchEvents', () => {
  it('returns every event, in the original order, for an empty query', () => {
    expect(ids(searchEvents(EVENTS, ''))).toEqual(['a', 'b', 'c', 'd']);
    expect(searchEvents(EVENTS, ' ')).not.toBe(EVENTS);
  });

  it('matches without accents or case', () => {
    expect(ids(searchEvents(EVENTS, 'PANAMA'))).toEqual(['b']);
    expect(ids(searchEvents(EVENTS, 'fernandez'))).toEqual(['a']);
  });

  it('matches the venue as well as the name', () => {
    expect(ids(searchEvents(EVENTS, 'saber'))).toEqual(['c']);
  });

  it('requires every word of the query to match', () => {
    expect(ids(searchEvents(EVENTS, 'estadio carew'))).toEqual(['b']);
    expect(searchEvents(EVENTS, 'estadio jazz')).toEqual([]);
  });

  it('ranks a name match above a venue match', () => {
    // "rod" starts the name of d and a word of the venue of b.
    expect(ids(searchEvents(EVENTS, 'rod'))).toEqual(['d', 'b']);
  });

  it('keeps the original order between equally good matches', () => {
    expect(ids(searchEvents(EVENTS, 'estadio'))).toEqual(['a', 'b']);
  });

  it('returns nothing (never an invented result) when no event matches', () => {
    expect(searchEvents(EVENTS, 'zzz')).toEqual([]);
  });
});

describe('moveActive', () => {
  it('starts at the first or the last option', () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
  });
  it('wraps around both ends', () => {
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
  });
  it('has nothing to activate in an empty list', () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
