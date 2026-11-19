import { describe, expect, it } from 'vitest';
import { eventCoverImage } from './event-cover';

describe('eventCoverImage', () => {
  it('routes sports matches and Rod Carew events to stadium photography', () => {
    expect(eventCoverImage('1', 'Panamá vs Costa Rica', 'Estadio Rod Carew')).toEqual({
      src: '/posters/stadium.webp',
      alt: '',
    });
  });

  it('routes jazz, theater and symphonic galas to intimate stage photography', () => {
    expect(eventCoverImage('2', 'Gala Navideña · Orquesta Sinfónica Nacional', 'Teatro Nacional').src).toBe('/posters/jazz.webp');
    expect(eventCoverImage('3', 'Panamá Jazz Festival 2027', 'Teatro Anayansi').src).toBe('/posters/jazz.webp');
  });

  it('routes open-air/figali concerts to festival photography and headline tours to concert', () => {
    expect(eventCoverImage('4', 'Fin de Año Salsero', 'Figali Convention Center').src).toBe('/posters/festival.webp');
    expect(eventCoverImage('5', 'Concierto Bad Bunny', 'Estadio Rommel Fernández').src).toBe('/posters/concert.webp');
  });

  it('falls back deterministically for generic custom event names', () => {
    const a = eventCoverImage('custom-abc', 'Noche Electrónica');
    const b = eventCoverImage('custom-abc', 'Noche Electrónica');
    expect(a).toEqual(b);
    expect(a.src).toMatch(/^\/posters\/(concert|stadium|festival|jazz)\.webp$/);
  });
});
