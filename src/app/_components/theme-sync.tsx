'use client';

import { useEffect } from 'react';
import { motionAllowed } from '@/lib/ui/motion';
import { THEME_COLORS, resolveTheme } from '@/lib/ui/theme';

const SYSTEM_DARK = '(prefers-color-scheme: dark)';
type TransitionDocument = Document & { startViewTransition?: (arg: unknown) => unknown };

function applySystemTheme(animate: boolean): void {
  let dark = false;
  try {
    dark = window.matchMedia(SYSTEM_DARK).matches;
  } catch {
    dark = false;
  }
  const resolved = resolveTheme('system', dark);
  const update = () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-pref', 'system');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
  };
  if (animate) {
    const doc = document as TransitionDocument;
    if (typeof doc.startViewTransition === 'function' && motionAllowed(window)) {
      try {
        doc.startViewTransition({ update, types: ['theme'] });
        return;
      } catch {
        // Fall back to direct update when transition types are unsupported
      }
    }
  }
  update();
}

/** Keeps <html data-theme> aligned with the user's operating system dark/light preference live. */
export default function ThemeSync() {
  useEffect(() => {
    applySystemTheme(false);
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia(SYSTEM_DARK);
    } catch {
      return;
    }
    const onChange = () => applySystemTheme(true);
    mql.addEventListener('change', onChange);
    return () => mql?.removeEventListener('change', onChange);
  }, []);
  return null;
}
