'use client';

import { useId, useSyncExternalStore } from 'react';
import { motionAllowed } from '@/lib/ui/motion';
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/ui/theme';
import { IconMonitor, IconMoon, IconSun } from './icons';

// The source of truth is the DOM: <html data-theme-pref> (the stored choice) and
// <html data-theme> (the resolved theme), both written before the first paint by the inline
// bootstrap. This module only mirrors and changes them, so several selectors on a page (header
// and footer) and other tabs stay in step.

const SYSTEM_DARK = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** A choice that was just made and is being applied (the page swap may take one frame). */
let pending: ThemePreference | null = null;

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(SYSTEM_DARK).matches;
  } catch {
    return false;
  }
}

function readPreference(): ThemePreference {
  return pending ?? parseThemePreference(document.documentElement.getAttribute('data-theme-pref'));
}

function apply(preference: ThemePreference): void {
  const root = document.documentElement;
  const resolved = resolveTheme(preference, systemPrefersDark());
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', preference);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

type TransitionDocument = Document & { startViewTransition?: (arg: unknown) => unknown };

/** Stores the choice and applies it. Where the browser can, the swap is one short crossfade of
 *  the whole page (a view transition) instead of hundreds of per-element colour transitions. */
function setPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page.
  }
  // The selector shows the new choice at once; the page itself changes inside the transition.
  pending = preference;
  emit();
  const update = () => {
    apply(preference);
    pending = null;
    emit();
  };
  const doc = document as TransitionDocument;
  if (typeof doc.startViewTransition === 'function' && motionAllowed(window)) {
    try {
      doc.startViewTransition({ update, types: ['theme'] });
      return;
    } catch {
      // Older engines only take a callback, or have no transition types.
      try {
        doc.startViewTransition(update);
        return;
      } catch {
        // fall through to the instant swap
      }
    }
  }
  update();
}

function onStorage(e: StorageEvent) {
  if (e.key !== THEME_STORAGE_KEY) return;
  apply(parseThemePreference(e.newValue));
  emit();
}

// 'system' follows the operating system live, and only while it is the selected option.
function onSystemChange() {
  if (readPreference() === 'system') apply('system');
  emit();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', onStorage);
    try {
      window.matchMedia(SYSTEM_DARK).addEventListener('change', onSystemChange);
    } catch {
      // no matchMedia: 'system' simply resolves to light
    }
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
      try {
        window.matchMedia(SYSTEM_DARK).removeEventListener('change', onSystemChange);
      } catch {
        // nothing to remove
      }
    }
  };
}

const OPTIONS: { value: ThemePreference; label: string; Icon: () => React.JSX.Element }[] = [
  { value: 'light', label: 'Tema claro', Icon: IconSun },
  { value: 'system', label: 'Tema del sistema', Icon: IconMonitor },
  { value: 'dark', label: 'Tema oscuro', Icon: IconMoon },
];

/** Light / system / dark selector: a native radio group (arrow keys work), styled as a 3-way switch. */
export default function ThemeSwitch() {
  // Server and first client render agree on the default; the real choice is read right after
  // hydration. The thumb is positioned by CSS from <html data-theme-pref>, so it is already in
  // the right place before that.
  const preference = useSyncExternalStore(subscribe, readPreference, () => DEFAULT_THEME);
  const name = useId();
  return (
    <fieldset className="theme-switch">
      <legend className="visually-hidden">Tema de color</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label key={value} className="theme-option" data-value={value} title={label}>
          <input type="radio" name={name} value={value} checked={preference === value} onChange={() => setPreference(value)} />
          <Icon />
          <span className="visually-hidden">{label}</span>
        </label>
      ))}
      <span className="theme-thumb" aria-hidden="true" />
    </fieldset>
  );
}
