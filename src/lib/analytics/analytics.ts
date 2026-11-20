/**
 * Analytics and conversion tracking, behind consent. Provider: Google Analytics 4 (the measurement
 * id comes from ANALYTICS_GA4_ID; without it nothing here ever runs). The tag is NOT in the HTML:
 * `loadAnalytics` injects it only after the visitor accepts analytics cookies, and `unloadAnalytics`
 * switches it off and clears its cookies when the choice is withdrawn.
 *
 * Conversions are declared in the markup, so a page needs no analytics code of its own:
 *   <a data-track="begin_checkout" data-track-label="comprar">…</a>
 * One delegated click listener (see analytics.tsx) turns those attributes into events. Only the
 * names in TRACKED_EVENTS are sent. No personal data is ever attached.
 *
 * Browser-only module.
 */

/** GA4 recommended event names where one exists, so reports work without custom setup. */
export const TRACKED_EVENTS = ['begin_checkout', 'generate_lead', 'sell_cta_click', 'login_start'] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

type Gtag = (...args: unknown[]) => void;
interface AnalyticsWindow {
  dataLayer?: unknown[];
  gtag?: Gtag;
  [key: `ga-disable-${string}`]: boolean | undefined;
}
const w = (): AnalyticsWindow => window as unknown as AnalyticsWindow;

export const isTrackedEvent = (name: string | null | undefined): name is TrackedEvent =>
  !!name && (TRACKED_EVENTS as readonly string[]).includes(name);

let loadedId: string | null = null;

export function loadAnalytics(measurementId: string): void {
  const win = w();
  win[`ga-disable-${measurementId}`] = false;
  if (loadedId === measurementId) return;
  loadedId = measurementId;
  win.dataLayer = win.dataLayer ?? [];
  win.gtag = function gtag() {
    // gtag.js reads `arguments` objects from the data layer, not arrays.
    win.dataLayer!.push(arguments);
  };
  win.gtag('js', new Date());
  // No advertising features and no ad personalisation: measurement only.
  win.gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/** Stops measuring and removes the Google Analytics cookies this site could set (`_ga`, `_ga_<id>`). */
export function unloadAnalytics(measurementId: string): void {
  w()[`ga-disable-${measurementId}`] = true;
  const hostParts = location.hostname.split('.');
  const domains = ['', location.hostname];
  for (let i = 1; i < hostParts.length - 1; i++) domains.push(`.${hostParts.slice(i).join('.')}`);
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

export function trackEvent(name: TrackedEvent, params?: Record<string, string>): void {
  const gtag = w().gtag;
  if (loadedId && gtag) gtag('event', name, params);
}
