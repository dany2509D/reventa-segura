import { hashSeed } from './poster';

export type CoverImage = { src: string; alt: string };

const COVERS = [
  '/posters/concert.webp',
  '/posters/stadium.webp',
  '/posters/festival.webp',
  '/posters/jazz.webp',
] as const;

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Deterministic visual cover mapping for seeded and newly created events until per-event artwork
 * uploads are stored on the event record. Uses only local crisp WebP photography in `public/posters`.
 */
export function eventCoverImage(id: string, name: string, venue = ''): CoverImage {
  const hay = norm(`${name} ${venue}`);

  if (/\b(vs|amistoso|futbol|copa|seleccion|clasico)\b/.test(hay) || /rod carew/.test(hay)) {
    return { src: '/posters/stadium.webp', alt: '' };
  }
  if (/\b(jazz|orquesta|sinfonica|teatro|gala|bernarda|obra)\b/.test(hay)) {
    return { src: '/posters/jazz.webp', alt: '' };
  }
  if (/\b(salsero|salsa|festival|urbano|figali|plaza|amador)\b/.test(hay) && !/\bjazz festival\b/.test(hay)) {
    return { src: '/posters/festival.webp', alt: '' };
  }
  if (/\b(concierto|bad bunny|tour|show)\b/.test(hay)) {
    return { src: '/posters/concert.webp', alt: '' };
  }

  return { src: COVERS[hashSeed(id) % COVERS.length], alt: '' };
}
