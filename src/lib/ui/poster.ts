// Deterministic art direction for the generative event posters (src/app/_components/event-poster.tsx).
// Events have no photograph yet, so every event gets an owned, clearly illustrative composition:
// a palette, a geometric motif and a typographic crop of its own name. The same event id always
// yields the same poster, on every page and on every render (server or client).

export const POSTER_PALETTES = ['noche', 'cielo', 'menta', 'marea', 'papel'] as const;
export const POSTER_MOTIFS = ['arcos', 'focos', 'rayos', 'trama', 'ondas', 'cancha'] as const;
export type PosterPalette = (typeof POSTER_PALETTES)[number];
export type PosterMotif = (typeof POSTER_MOTIFS)[number];
export type PosterVariant = { palette: PosterPalette; motif: PosterMotif; flip: boolean };

/** FNV-1a, 32 bits: small, stable and well spread for short ids. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function posterVariant(seed: string): PosterVariant {
  const h = hashSeed(seed);
  return {
    palette: POSTER_PALETTES[h % POSTER_PALETTES.length],
    motif: POSTER_MOTIFS[(h >>> 8) % POSTER_MOTIFS.length],
    flip: ((h >>> 16) & 1) === 1,
  };
}

const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'e', 'a', 'al', 'con', 'por', 'para', 'vs', 'the', 'of', 'and']);

/**
 * The typographic crop of a poster: up to three upper-case fragments of the event's own name,
 * most distinctive words first (longest non-filler words, in reading order). Decorative only:
 * the full name is always printed as real text next to the poster.
 */
export function posterWords(name: string): string[] {
  const words = name
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return [];
  const meaningful = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()) && w.length > 1);
  const pool = meaningful.length > 0 ? meaningful : words;
  const keep = new Set(
    pool
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w.length - a.w.length || a.i - b.i)
      .slice(0, 3)
      .map((x) => x.i),
  );
  // toUpperCase (not the locale-aware variant): the same result on the server and in any browser.
  return pool.filter((_, i) => keep.has(i)).map((w) => w.toUpperCase());
}

/** Short printed-matter reference for a poster corner ("3F2A·91C0"), from the id itself. */
export function posterSerial(seed: string): string {
  const hex = hashSeed(seed).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}·${hex.slice(4)}`;
}
