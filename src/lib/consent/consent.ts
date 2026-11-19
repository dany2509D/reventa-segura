/**
 * Cookie / storage consent, kept in the visitor's browser (localStorage). Pure helpers: the banner
 * (cookie-consent.tsx) writes the choice, the analytics loader (analytics.tsx) reads it.
 *
 * Categories: "necessary" (session, theme, this very choice: always on, no consent needed) and
 * "analytics" (off until the visitor accepts). The choice is re-asked after a year, and whenever
 * CONSENT_VERSION changes (a new category or purpose).
 */

export const CONSENT_STORAGE_KEY = 'rs-consent';
export const CONSENT_VERSION = 1;
/** Dispatched on `window` after every saved choice; `detail` is the new ConsentState. */
export const CONSENT_EVENT = 'rs:consent-change';
/** Dispatched on `window` by the footer link to reopen the preferences dialog. */
export const OPEN_PREFERENCES_EVENT = 'rs:open-cookie-preferences';
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface ConsentState {
  v: number;
  analytics: boolean;
  /** ISO time of the choice. */
  at: string;
}

/** Valid, current and not expired; anything else (corrupt, old version, too old) counts as "no choice yet". */
export function parseConsent(raw: unknown, now: Date = new Date()): ConsentState | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { v, analytics, at } = data as Record<string, unknown>;
  if (v !== CONSENT_VERSION || typeof analytics !== 'boolean' || typeof at !== 'string') return null;
  const when = Date.parse(at);
  if (!Number.isFinite(when) || now.getTime() - when > CONSENT_MAX_AGE_MS || when - now.getTime() > 60_000) return null;
  return { v, analytics, at };
}

export function serializeConsent(analytics: boolean, now: Date = new Date()): string {
  const state: ConsentState = { v: CONSENT_VERSION, analytics, at: now.toISOString() };
  return JSON.stringify(state);
}

/** The stored choice, or null. Never throws: storage can be blocked (private mode, policies). */
export function readConsent(now: Date = new Date()): ConsentState | null {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY), now);
  } catch {
    return null;
  }
}

/** Saves the choice and tells the rest of the page. Returns the state (kept in memory if storage is blocked). */
export function writeConsent(analytics: boolean, now: Date = new Date()): ConsentState {
  const raw = serializeConsent(analytics, now);
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, raw);
  } catch {
    // Blocked storage: the choice still applies for this page view.
  }
  const state = JSON.parse(raw) as ConsentState;
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
  return state;
}
