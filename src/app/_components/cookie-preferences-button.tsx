'use client';

import type { ReactNode } from 'react';
import { OPEN_PREFERENCES_EVENT } from '@/lib/consent/consent';

/** Reopens the cookie preferences dialog (cookie-consent.tsx) from anywhere: the footer, the cookie policy. */
export default function CookiePreferencesButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))}>
      {children}
    </button>
  );
}
