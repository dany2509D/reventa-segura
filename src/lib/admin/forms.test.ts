import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { panamaLocalToDate, parseEventForm, usdToCents } from './forms';

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const base = {
  name: ' Bad Bunny ',
  venue: 'Estadio Rommel',
  lat: '8.9936',
  lng: '-79.5197',
  radiusM: '400',
  startsAt: '2027-01-10T20:00',
  faceValue: '85.50',
};

describe('usdToCents', () => {
  it.each([['25', 2500], ['25.5', 2550], ['25.50', 2550], ['0.01', 1], ['1,250.00', 125000]] as const)('%s → %i', (s, c) => {
    expect(usdToCents(s)).toBe(c);
  });
  it.each(['', ' ', 'abc', '-5', '0', '0.00', '12.345', '1e3', 'NaN', '99999999999'])('rejects %j', (s) => {
    expect(() => usdToCents(s)).toThrow(ValidationError);
  });
});

describe('panamaLocalToDate', () => {
  it('reads a datetime-local value as Panama time (UTC−5, no DST)', () => {
    expect(panamaLocalToDate('2027-01-10T20:00').toISOString()).toBe('2027-01-11T01:00:00.000Z');
  });
  it.each(['', 'ayer', '2027-13-40T99:99', '2027-01-10'])('rejects %j', (s) => {
    expect(() => panamaLocalToDate(s)).toThrow(ValidationError);
  });
});

describe('parseEventForm', () => {
  it('builds a NewEvent: dollars to cents, Panama time, checkboxes as booleans, text trimmed', () => {
    const e = parseEventForm(form({ ...base, allowsTransfer: 'on' }));
    expect(e).toMatchObject({
      name: 'Bad Bunny',
      venue: 'Estadio Rommel',
      lat: 8.9936,
      lng: -79.5197,
      radiusM: 400,
      faceValueCents: 8550,
      allowsTransfer: true,
      resaleProhibited: false,
    });
    expect(e.startsAt.toISOString()).toBe('2027-01-11T01:00:00.000Z');
  });
  it('a missing checkbox means false, an "on" resaleProhibited means true', () => {
    expect(parseEventForm(form({ ...base, resaleProhibited: 'on' }))).toMatchObject({ allowsTransfer: false, resaleProhibited: true });
  });
  it.each([
    ['lat', 'abc'],
    ['lng', ''],
    ['radiusM', '12.5'],
    ['radiusM', 'x'],
    ['faceValue', '-1'],
  ])('rejects a bad %s (%j) with a ValidationError', (k, v) => {
    expect(() => parseEventForm(form({ ...base, [k]: v }))).toThrow(ValidationError);
  });
});
