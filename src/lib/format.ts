/** Integer cents → "$1,234.56". Throws on non-integers: never print a silently wrong amount. */
export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`cents must be an integer, got ${cents}`);
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** An instant as "dd/mm/yyyy hh:mm" in Panama time (UTC−5, no DST). */
export function formatPanamaDateTime(d: Date): string {
  const p = new Date(d.getTime() - 5 * 3_600_000);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(p.getUTCDate())}/${z(p.getUTCMonth() + 1)}/${p.getUTCFullYear()} ${z(p.getUTCHours())}:${z(p.getUTCMinutes())}`;
}
