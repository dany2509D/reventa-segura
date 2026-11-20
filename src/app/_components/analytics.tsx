'use client';

import { useEffect } from 'react';
import { isTrackedEvent, loadAnalytics, trackEvent, unloadAnalytics } from '@/lib/analytics/analytics';
import { CONSENT_EVENT, readConsent, type ConsentState } from '@/lib/consent/consent';

/**
 * Loads analytics only while the visitor has accepted analytics cookies (cookie-consent.tsx), and
 * turns `data-track` attributes into conversion events. Renders nothing. Without a measurement id
 * (ANALYTICS_GA4_ID) it does nothing at all: no script, no listener.
 */
export default function Analytics({ measurementId }: { measurementId?: string }) {
  useEffect(() => {
    if (!measurementId) return;

    if (readConsent()?.analytics) loadAnalytics(measurementId);

    const onConsent = (event: Event) => {
      const state = (event as CustomEvent<ConsentState>).detail;
      if (state.analytics) loadAnalytics(measurementId);
      else unloadAnalytics(measurementId);
    };
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.('[data-track]');
      const name = el?.getAttribute('data-track');
      if (!el || !isTrackedEvent(name)) return;
      const label = el.getAttribute('data-track-label');
      trackEvent(name, label ? { label } : undefined);
    };

    window.addEventListener(CONSENT_EVENT, onConsent);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener(CONSENT_EVENT, onConsent);
      document.removeEventListener('click', onClick);
    };
  }, [measurementId]);

  return null;
}
