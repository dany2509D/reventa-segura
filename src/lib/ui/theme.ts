// Theme logic shared by the pre-paint bootstrap (an inline script in <head>, see
// src/app/_components/theme-script.tsx) and the live system listener (theme-sync.tsx).
//
// The page always follows the user's operating-system / browser appearance ('system'): the
// bootstrap resolves '(prefers-color-scheme: dark)' before the first paint into <html data-theme="light|dark">,
// so globals.css needs no prefers-color-scheme media query.

export const THEME_STORAGE_KEY = 'rs-theme-v5';
export const THEME_PREFERENCES = ['light', 'system', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';
export const DEFAULT_THEME: ThemePreference = 'system';

/** Browser chrome colour per theme (matches --bg in globals.css; checked in design-tokens.test.ts). */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#F2F0EC', dark: '#0F0F12' };

/** Anything unknown falls back cleanly to system preference. */
export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Source of the inline script that runs before the first paint. Plain ES5, no dependencies, every
 * browser API wrapped in try/catch (private mode, blocked storage). Sets on <html>:
 *  - data-theme       resolved theme ('light' | 'dark') matching system preference
 *  - data-theme-pref  stored or default preference ('system')
 *  - data-js          JavaScript is running: lets CSS enhance progressively
 *  - data-reveal="on" scroll reveals armed until IntersectionObserver mounts (3 s failsafe)
 *  - data-vt          cross-document view transitions supported
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){var d=document.documentElement,p='${DEFAULT_THEME}',k=false;try{var s=window.localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark'||s==='system')p=s}catch(e){}try{k=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}var r=p==='system'?(k?'dark':'light'):p;d.setAttribute('data-theme',r);d.setAttribute('data-theme-pref',p);d.setAttribute('data-js','');try{var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute('content',r==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}')}catch(e){}try{if('IntersectionObserver' in window){d.setAttribute('data-reveal','on');window.setTimeout(function(){if(!window.__rsReveal)d.removeAttribute('data-reveal')},3000)}if('CSSViewTransitionRule' in window)d.setAttribute('data-vt','')}catch(e){}})();`;
