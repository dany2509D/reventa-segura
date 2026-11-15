import { describe, expect, it } from 'vitest';
import { distanceM, isWithinRadius } from './geo';

// Estadio Rommel Fernández, Ciudad de Panamá.
const venue = { lat: 9.0418, lng: -79.4747 };
// One degree of latitude is ~111.2 km on the haversine sphere (R = 6371 km).
const northBy = (m: number) => ({ lat: venue.lat + m / 111_195, lng: venue.lng });

describe('isWithinRadius', () => {
  it('a point 100 m from the venue is inside a 300 m radius', () => {
    const p = northBy(100);
    expect(distanceM(p, venue)).toBeCloseTo(100, 0);
    expect(isWithinRadius(p, venue, 300)).toBe(true);
  });

  it('a point 5 km from the venue is outside a 300 m radius', () => {
    const p = northBy(5000);
    expect(distanceM(p, venue)).toBeCloseTo(5000, -1);
    expect(isWithinRadius(p, venue, 300)).toBe(false);
  });

  it('the boundary is inclusive and distance is symmetric', () => {
    expect(isWithinRadius(venue, venue, 0)).toBe(true);
    const p = northBy(300);
    expect(distanceM(p, venue)).toBeCloseTo(distanceM(venue, p), 9);
  });

  it('works across the antimeridian', () => {
    expect(isWithinRadius({ lat: 0, lng: 179.9995 }, { lat: 0, lng: -179.9995 }, 200)).toBe(true);
  });

  it.each([
    [{ lat: Number.NaN, lng: venue.lng }],
    [{ lat: venue.lat, lng: Number.NaN }],
    [{ lat: 91, lng: 0 }],
    [{ lat: -91, lng: 0 }],
    [{ lat: 0, lng: 181 }],
    [{ lat: 0, lng: -181 }],
    [{ lat: Number.POSITIVE_INFINITY, lng: 0 }],
  ])('returns false for an invalid point %o', (p) => {
    expect(isWithinRadius(p, venue, 1_000_000_000)).toBe(false);
  });

  it('returns false for an invalid venue or radius', () => {
    expect(isWithinRadius(venue, { lat: Number.NaN, lng: 0 }, 300)).toBe(false);
    expect(isWithinRadius(venue, venue, Number.NaN)).toBe(false);
    expect(isWithinRadius(venue, venue, -1)).toBe(false);
  });
});
