import { describe, expect, it } from 'vitest';
import { formatPanamaDateTime, formatUsd } from './format';

describe('formatUsd', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [4550, '$45.50'],
    [123456, '$1,234.56'],
    [-4500, '-$45.00'],
  ] as const)('%i → %s', (c, s) => {
    expect(formatUsd(c)).toBe(s);
  });

  it('rejects non-integers instead of printing a wrong amount', () => {
    expect(() => formatUsd(10.5)).toThrow(RangeError);
    expect(() => formatUsd(NaN)).toThrow(RangeError);
  });
});

describe('formatPanamaDateTime', () => {
  it('shows an instant in Panama time (UTC−5)', () => {
    expect(formatPanamaDateTime(new Date('2027-01-11T01:00:00Z'))).toBe('10/01/2027 20:00');
  });
});
