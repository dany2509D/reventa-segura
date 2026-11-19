import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COLORS,
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from './theme';

describe('parseThemePreference', () => {
  it('accepts the three known values', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
  });
  it('falls back to system for anything else', () => {
    expect(DEFAULT_THEME).toBe('system');
    for (const raw of [null, undefined, '', 'DARK', 'auto', 42, {}]) expect(parseThemePreference(raw)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the operating system only when "system" is selected', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

// Runs the real inline bootstrap in a sandbox with a fake document.
type Options = {
  stored?: string | null;
  storageThrows?: boolean;
  systemDark?: boolean;
  matchMediaThrows?: boolean;
  intersectionObserver?: boolean;
  crossDocumentTransitions?: boolean;
};
function boot(o: Options = {}) {
  const attrs: Record<string, string> = {};
  const meta = { content: '#ffffff' };
  const timers: (() => void)[] = [];
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: () => {
        if (o.storageThrows) throw new Error('blocked');
        return o.stored ?? null;
      },
    },
    matchMedia: () => {
      if (o.matchMediaThrows) throw new Error('unsupported');
      return { matches: o.systemDark === true };
    },
    setTimeout: (fn: () => void) => void timers.push(fn),
  };
  if (o.intersectionObserver !== false) win.IntersectionObserver = function () {};
  if (o.crossDocumentTransitions) win.CSSViewTransitionRule = function () {};
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => void (attrs[k] = v),
      removeAttribute: (k: string) => void delete attrs[k],
    },
    querySelector: (sel: string) =>
      sel === 'meta[name="theme-color"]' ? { setAttribute: (_k: string, v: string) => void (meta.content = v) } : null,
  };
  vm.runInNewContext(THEME_BOOTSTRAP_SCRIPT, { window: win, document });
  return { attrs, meta, timers, win };
}

describe('THEME_BOOTSTRAP_SCRIPT (pre-paint inline script)', () => {
  it('follows the operating system by default (light when system is light, dark when system is dark)', () => {
    const lightSys = boot({ stored: null, systemDark: false });
    expect(lightSys.attrs['data-theme']).toBe('light');
    expect(lightSys.attrs['data-theme-pref']).toBe('system');
    expect(lightSys.meta.content).toBe(THEME_COLORS.light);

    const darkSys = boot({ stored: null, systemDark: true });
    expect(darkSys.attrs['data-theme']).toBe('dark');
    expect(darkSys.attrs['data-theme-pref']).toBe('system');
    expect(darkSys.meta.content).toBe(THEME_COLORS.dark);
  });

  it('applies a stored override when present', () => {
    const { attrs, meta } = boot({ stored: 'light', systemDark: true });
    expect(attrs['data-theme']).toBe('light');
    expect(attrs['data-theme-pref']).toBe('light');
    expect(meta.content).toBe(THEME_COLORS.light);
  });

  it('follows the operating system for a stored "system" preference', () => {
    expect(boot({ stored: 'system', systemDark: true }).attrs['data-theme']).toBe('dark');
    expect(boot({ stored: 'system', systemDark: false }).attrs['data-theme']).toBe('light');
    expect(boot({ stored: 'system', systemDark: true }).attrs['data-theme-pref']).toBe('system');
  });

  it('agrees with parseThemePreference / resolveTheme for every input', () => {
    for (const stored of ['light', 'dark', 'system', 'purple', '', null]) {
      for (const systemDark of [true, false]) {
        const pref: ThemePreference = parseThemePreference(stored);
        const { attrs } = boot({ stored, systemDark });
        expect(attrs['data-theme-pref']).toBe(pref);
        expect(attrs['data-theme']).toBe(resolveTheme(pref, systemDark));
      }
    }
  });

  it('survives blocked storage and a missing matchMedia', () => {
    const { attrs } = boot({ storageThrows: true, matchMediaThrows: true });
    expect(attrs['data-theme']).toBe('light');
    expect(attrs['data-js']).toBe('');
  });

  it('arms scroll reveals only with IntersectionObserver, and disarms them if the observer never starts', () => {
    expect(boot({ intersectionObserver: false }).attrs).not.toHaveProperty('data-reveal');

    const stalled = boot();
    expect(stalled.attrs['data-reveal']).toBe('on');
    stalled.timers.forEach((fn) => fn()); // 3 s later, nothing reported in
    expect(stalled.attrs).not.toHaveProperty('data-reveal');

    const healthy = boot();
    healthy.win.__rsReveal = true; // reveal-observer.tsx mounted
    healthy.timers.forEach((fn) => fn());
    expect(healthy.attrs['data-reveal']).toBe('on');
  });

  it('flags native cross-document view transitions', () => {
    expect(boot({ crossDocumentTransitions: true }).attrs).toHaveProperty('data-vt');
    expect(boot().attrs).not.toHaveProperty('data-vt');
  });

  it('contains nothing a strict CSP or an HTML parser would choke on', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).not.toMatch(/<\/?script|<!--|eval\(|new Function/i);
    expect(THEME_BOOTSTRAP_SCRIPT).not.toMatch(/https?:\/\//);
  });
});
