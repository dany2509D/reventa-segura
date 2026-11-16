export type LatLng = { lat: number; lng: number };

/** Mean Earth radius used by the haversine formula, in metres. */
const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

/** Great-circle distance in metres (haversine). Callers validate the points first. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when `p` lies within `radiusM` metres of the venue (boundary inclusive).
 * Any invalid input (NaN, out-of-range coordinates, negative radius) yields false.
 */
export function isWithinRadius(p: LatLng, venue: LatLng, radiusM: number): boolean {
  if (!isValidLatLng(p) || !isValidLatLng(venue)) return false;
  if (!Number.isFinite(radiusM) || radiusM < 0) return false;
  return distanceM(p, venue) <= radiusM;
}
