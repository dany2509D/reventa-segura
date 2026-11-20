import { describe, expect, it } from 'vitest';
import { CONSENT_MAX_AGE_MS, CONSENT_VERSION, parseConsent, serializeConsent } from './consent';

const NOW = new Date('2026-11-18T12:00:00Z');

describe('consent storage format', () => {
  it('round-trips a choice', () => {
    expect(parseConsent(serializeConsent(true, NOW), NOW)).toEqual({ v: CONSENT_VERSION, analytics: true, at: NOW.toISOString() });
    expect(parseConsent(serializeConsent(false, NOW), NOW)?.analytics).toBe(false);
  });

  it('treats anything unusable as "no choice yet", so analytics stays off', () => {
    for (const raw of [null, undefined, '', 'nope', '[]', 'null', '{}', '{"v":1,"analytics":"yes","at":"2026-11-18T12:00:00Z"}']) {
      expect(parseConsent(raw, NOW)).toBeNull();
    }
  });

  it('asks again when the version changed or the choice is more than a year old', () => {
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION + 1, analytics: true, at: NOW.toISOString() }), NOW)).toBeNull();
    const old = new Date(NOW.getTime() - CONSENT_MAX_AGE_MS - 1000).toISOString();
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: true, at: old }), NOW)).toBeNull();
    const recent = new Date(NOW.getTime() - CONSENT_MAX_AGE_MS + 60_000).toISOString();
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: true, at: recent }), NOW)?.analytics).toBe(true);
  });

  it('rejects a choice dated in the future', () => {
    const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: true, at: future }), NOW)).toBeNull();
  });
});
