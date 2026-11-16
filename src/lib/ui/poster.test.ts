import { describe, expect, it } from 'vitest';
import { POSTER_MOTIFS, POSTER_PALETTES, hashSeed, posterSerial, posterVariant, posterWords } from './poster';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('posterVariant', () => {
  it('is deterministic for an id', () => {
    const id = '3f2a91c0-5b7e-4d1a-9c3e-2f6b8a4d7e10';
    expect(posterVariant(id)).toEqual(posterVariant(id));
    expect(hashSeed(id)).toBe(hashSeed(id));
  });

  it('only ever returns known palettes and motifs', () => {
    for (let i = 0; i < 200; i++) {
      const v = posterVariant(uuid(i));
      expect(POSTER_PALETTES).toContain(v.palette);
      expect(POSTER_MOTIFS).toContain(v.motif);
      expect(typeof v.flip).toBe('boolean');
    }
  });

  it('spreads ids over every palette and motif', () => {
    const palettes = new Set<string>();
    const motifs = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const v = posterVariant(uuid(i));
      palettes.add(v.palette);
      motifs.add(v.motif);
    }
    expect(palettes.size).toBe(POSTER_PALETTES.length);
    expect(motifs.size).toBe(POSTER_MOTIFS.length);
  });
});

describe('posterWords', () => {
  it('uses fragments of the real event name, filler words dropped, in reading order', () => {
    expect(posterWords('Concierto Bad Bunny')).toEqual(['CONCIERTO', 'BAD', 'BUNNY']);
    expect(posterWords('Panamá vs Costa Rica')).toEqual(['PANAMÁ', 'COSTA', 'RICA']);
    expect(posterWords('Festival de Jazz de la Ciudad de Panamá')).toEqual(['FESTIVAL', 'CIUDAD', 'PANAMÁ']);
  });

  it('never invents text', () => {
    expect(posterWords('')).toEqual([]);
    expect(posterWords('  —  ')).toEqual([]);
    expect(posterWords('La de el')).toEqual(['LA', 'DE', 'EL']);
  });
});

describe('posterSerial', () => {
  it('is a stable 8-digit hex reference derived from the id', () => {
    expect(posterSerial(uuid(1))).toMatch(/^[0-9A-F]{4}·[0-9A-F]{4}$/);
    expect(posterSerial(uuid(1))).toBe(posterSerial(uuid(1)));
    expect(posterSerial(uuid(1))).not.toBe(posterSerial(uuid(2)));
  });
});
