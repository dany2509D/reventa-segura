import { describe, expect, it } from 'vitest';
import { formatPanamaDateTime } from '@/lib/format';
import { longDateLabel, panamaDateParts, shortDateLabel } from './dates';

describe('panamaDateParts', () => {
  it('reads an instant in Panama time (UTC-5)', () => {
    // 2026-11-08 01:00 UTC is still Saturday 7 November, 20:00, in Panama.
    const parts = panamaDateParts(new Date('2026-11-08T01:00:00Z'));
    expect(parts).toEqual({
      day: '07',
      month: 'nov',
      monthLong: 'noviembre',
      weekday: 'sáb',
      weekdayLong: 'sábado',
      year: '2026',
      time: '20:00',
      iso: '2026-11-07T20:00-05:00',
    });
  });

  it('crosses the year boundary correctly', () => {
    const parts = panamaDateParts(new Date('2027-01-01T03:30:00Z'));
    expect([parts.day, parts.month, parts.year, parts.time]).toEqual(['31', 'dic', '2026', '22:30']);
  });

  it('agrees with the app-wide formatter (formatPanamaDateTime)', () => {
    for (const iso of ['2026-11-08T01:00:00Z', '2026-12-25T17:45:00Z', '2027-03-01T04:59:00Z']) {
      const d = new Date(iso);
      const p = panamaDateParts(d);
      const monthNumber = p.iso.slice(5, 7);
      expect(`${p.day}/${monthNumber}/${p.year} ${p.time}`).toBe(formatPanamaDateTime(d));
    }
  });

  it('produces an ISO string that points back to the same instant', () => {
    const d = new Date('2026-11-21T00:15:00Z');
    expect(new Date(panamaDateParts(d).iso).getTime()).toBe(d.getTime());
  });
});

describe('labels', () => {
  const parts = panamaDateParts(new Date('2026-11-08T01:00:00Z'));
  it('builds the short label', () => expect(shortDateLabel(parts)).toBe('sáb 7 nov · 20:00'));
  it('builds the long label', () => expect(longDateLabel(parts)).toBe('sábado 7 de noviembre de 2026, 20:00'));
});
