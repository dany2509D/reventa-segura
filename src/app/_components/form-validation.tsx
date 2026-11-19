'use client';

import { useEffect } from 'react';

// Keeps aria-invalid in step with the browser's :user-invalid state for every field inside a
// `.form`. :user-invalid only matches after the person has interacted with the field, so a screen
// reader hears "invalid" at the same moment the field turns red, never on page load.
// Initial `aria-invalid={false}` is declared in each form's JSX (instead of mutating the DOM here
// on mount, which would race streamed Suspense boundaries and trigger React hydration mismatches).
const FIELD = '.form input:not([type="radio"]):not([type="checkbox"]), .form select, .form textarea';

function sync(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
  if (!el.matches(FIELD)) return;
  let invalid = false;
  try {
    invalid = el.matches(':user-invalid');
  } catch {
    // Browser without :user-invalid: leave the field as it is.
    return;
  }
  el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

export default function FormValidation() {
  useEffect(() => {
    const onEvent = (e: Event) => {
      if (e.target instanceof Element) sync(e.target);
    };
    const events = ['blur', 'change', 'input', 'invalid'] as const;
    // blur and invalid do not bubble: listen in the capture phase.
    events.forEach((t) => document.addEventListener(t, onEvent, true));
    return () => events.forEach((t) => document.removeEventListener(t, onEvent, true));
  }, []);
  return null;
}
