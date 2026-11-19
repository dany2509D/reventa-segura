import { describe, expect, it } from 'vitest';
import { splitHeadline } from './headline';

describe('splitHeadline', () => {
  it.each([
    ['Panamá vs Jamaica · Amistoso', ['PANAMÁ VS', 'JAMAICA']],
    ['Concierto Urbano en Plaza Figali', ['CONCIERTO URBANO', 'EN PLAZA FIGALI']],
    ['Fin de Año Salsero', ['FIN DE AÑO', 'SALSERO']],
    ['Gala Navideña · Orquesta Sinfónica Nacional', ['GALA', 'NAVIDEÑA']],
    ['Festival', ['FESTIVAL', '']],
    ['   ', ['', '']],
  ])('%s', (name, expected) => {
    expect(splitHeadline(name)).toEqual(expected);
  });
});
