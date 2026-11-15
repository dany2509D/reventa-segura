export const DEFAULT_FEE_BPS = 1000;
export const DEFAULT_PRICE_CAP_BPS = 15000;

/** Commission rounds up to whole cents; feeCents + sellerNetCents === priceCents. */
export function computeFees(
  priceCents: number,
  feeBps: number,
): { feeCents: number; sellerNetCents: number } {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new RangeError(`priceCents must be a non-negative integer, got ${priceCents}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new RangeError(`feeBps must be an integer in 0..10000, got ${feeBps}`);
  }
  const feeCents = Math.ceil((priceCents * feeBps) / 10000);
  return { feeCents, sellerNetCents: priceCents - feeCents };
}

/** True when askCents is a positive integer not above faceValue * capBps / 10000. */
export function isPriceAllowed(
  askCents: number,
  faceValueCents: number,
  priceCapBps: number,
): boolean {
  if (!Number.isInteger(askCents) || askCents <= 0) return false;
  return askCents * 10000 <= faceValueCents * priceCapBps;
}
