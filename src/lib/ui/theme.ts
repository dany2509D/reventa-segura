// Theme logic shared by the pre-paint bootstrap (an inline script in <head>, see
// src/app/_components/theme-script.tsx) and the selector (theme-switch.tsx).
//
// The visitor chooses 'light' | 'dark' | 'system'; the choice lives in localStorage under 'theme'.
// The page itself only ever carries a RESOLVED theme in <html data-theme="light|dark">, so the
// stylesheet needs no prefers-color-scheme rule: 'system' is resolved here, in JS, and only when
// the visitor picked it. Default: light, whatever the operating system says.

export const THEME_STORAGE_KEY = 'theme';
export const THEME_PREFERENCES = ['light', 'system', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';
export const DEFAULT_THEME: ThemePreference = 'light';

/** Browser chrome colour per theme (matches --bg in globals.css; checked in design-tokens.test.ts). */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f8f9fb', dark: '#0b0c10' };

/** Anything that is not one of the three known values falls back to the default (light). */
export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Source of the inline script that runs before the first paint. Plain ES5, no dependencies, every
 * browser API wrapped in try/catch (private mode, blocked storage). It sets, on <html>:
 *  - data-theme       resolved theme ('light' | 'dark'): what the CSS reads
 *  - data-theme-pref  the stored choice: positions the selector's thumb before hydration
 *  - data-js          JavaScript is running: lets CSS enhance progressively
 *  - data-reveal="on" scroll reveals may hide content until it enters the viewport. Only set when
 *                     IntersectionObserver exists, and withdrawn after 3 s if the observer
 *                     (reveal-observer.tsx) never reported in: content is never left hidden.
 *  - data-vt          the browser animates same-origin navigations itself (cross-document view
 *                     transitions), so the CSS fallback entrance animation stays off
 * Kept in sync with parseThemePreference / resolveTheme by theme.test.ts, which runs this source.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){var d=document.documentElement,p='${DEFAULT_THEME}',k=false;try{var s=window.localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark'||s==='system')p=s}catch(e){}try{k=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}var r=p==='system'?(k?'dark':'light'):p;d.setAttribute('data-theme',r);d.setAttribute('data-theme-pref',p);d.setAttribute('data-js','');try{var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute('content',r==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}')}catch(e){}try{if('IntersectionObserver' in window){d.setAttribute('data-reveal','on');window.setTimeout(function(){if(!window.__rsReveal)d.removeAttribute('data-reveal')},3000)}if('CSSViewTransitionRule' in window)d.setAttribute('data-vt','')}catch(e){}})();`;
