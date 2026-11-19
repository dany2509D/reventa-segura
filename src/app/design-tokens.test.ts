import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '@/lib/ui/theme';

// Design-system guard rails: every text/background token pair meets WCAG AA in both themes, and the
// markup stays ready for a strict Content-Security-Policy (no inline styles, no remote CSS/fonts).

const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(readFileSync(join(APP_DIR, 'globals.css'), 'utf8'));

type Tokens = Record<string, string>;

/** Returns the body of the first `{ ... }` block that starts at or after `from` (brace-balanced). */
function blockBody(source: string, from: number): string {
  const open = source.indexOf('{', from);
  if (open < 0) throw new Error('no block');
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced block');
}

function declarations(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

function findBlock(selectorPattern: RegExp, source = css): string {
  const m = selectorPattern.exec(source);
  if (!m) throw new Error(`selector not found: ${selectorPattern}`);
  return blockBody(source, m.index + m[0].length - 1);
}

// Light is the default whatever the OS setting; dark applies only when [data-theme='dark'] is set.
const lightBody = findBlock(/(^|\n)\s*:root\s*\{/);
const light = declarations(lightBody);
const dark = declarations(findBlock(/:root\[data-theme=['"]dark['"]\]\s*\{/));

const themes: [string, Tokens][] = [
  ['light (default)', light],
  ["dark ([data-theme='dark'])", { ...light, ...dark }],
];

function resolve(tokens: Tokens, name: string, seen = new Set<string>()): string {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`missing token --${name}`);
  const ref = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(raw);
  if (!ref) return raw;
  if (seen.has(name)) throw new Error(`circular token --${name}`);
  seen.add(name);
  return resolve(tokens, ref[1], seen);
}

function rgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) throw new Error(`expected a hex colour, got ${color}`);
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background]
const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['text', 'surface-3'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-2'],
  ['brand-contrast', 'brand'],
  ['brand-contrast', 'brand-hover'],
  // Accent fills (sky, mint) carry ink text: buttons, highlights, the sell band, the active tab.
  ['accent-contrast', 'accent'],
  ['accent-contrast', 'accent-hover'],
  ['accent-contrast', 'accent-2'],
  ['accent-contrast', 'accent-2-hover'],
  // The same hues as text on surfaces.
  ['accent-ink', 'bg'],
  ['accent-ink', 'surface'],
  ['accent-ink', 'surface-2'],
  ['accent-ink', 'sky-soft'],
  ['accent-2-ink', 'bg'],
  ['accent-2-ink', 'surface'],
  ['accent-2-ink', 'mint-soft'],
  // Tinted panels (order states, confirmations).
  ['on-tint', 'sky-soft'],
  ['on-tint', 'mint-soft'],
  ['on-tint', 'sun-soft'],
  ['on-tint-muted', 'sky-soft'],
  ['on-tint-muted', 'mint-soft'],
  ['on-tint-muted', 'sun-soft'],
  // Inverted blocks: text over the solid part of image cards, "how it works", footer, tab bar.
  ['on-scrim', 'scrim'],
  ['on-scrim', 'scrim-2'],
  ['on-scrim', 'tabbar-bg'],
  ['on-scrim-muted', 'scrim'],
  ['on-scrim-muted', 'scrim-2'],
  ['on-scrim-muted', 'tabbar-bg'],
  // Chips laid over artwork (date badge, ticket count, CTA pill): ink on white / on sky.
  ['art-ink', 'art-white'],
  ['art-ink', 'art-sky'],
  ['art-ink', 'art-mint'],
  ['art-white', 'art-ink'],
  ['art-white', 'art-ink-2'],
  ['link', 'bg'],
  ['link', 'surface'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['success', 'success-soft'],
  ['warning', 'warning-soft'],
  ['info', 'info-soft'],
  ['text', 'success-soft'],
  ['text', 'warning-soft'],
  ['text', 'danger-soft'],
  ['text', 'info-soft'],
  ['text', 'nav-active-bg'],
];

// Non-text UI (WCAG 1.4.11): focus indicators and form-control boundaries.
const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['border-strong', 'bg'],
  ['border-strong', 'surface'],
  ['art-sky', 'scrim'], // focus ring and progress line on inverted blocks
];

describe('design tokens', () => {
  it('defines the required token set in the light theme', () => {
    const required = [
      'bg', 'surface', 'surface-2', 'surface-3', 'border', 'border-strong', 'text', 'text-muted',
      'brand', 'brand-hover', 'brand-contrast',
      'accent', 'accent-hover', 'accent-2', 'accent-2-hover', 'accent-contrast', 'accent-ink', 'accent-2-ink',
      'sky-soft', 'mint-soft', 'sun-soft', 'on-tint', 'on-tint-muted',
      'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'info', 'info-soft', 'link', 'focus',
      'scrim', 'scrim-2', 'scrim-border', 'on-scrim', 'on-scrim-muted', 'tabbar-bg', 'nav-active-bg', 'header-bg',
      'art-ink', 'art-ink-2', 'art-shadow', 'art-line', 'art-sky', 'art-mint', 'art-deep', 'art-paper', 'art-white',
      'shadow-sm', 'shadow-md', 'shadow-lg',
      'radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-pill',
      'space-1', 'space-2', 'space-3', 'space-4', 'space-5', 'space-6', 'space-8', 'space-10', 'space-12', 'space-16',
      'section-gap', 'gutter', 'container', 'header-h', 'tabbar-space',
      'font-sans', 'font-mono',
      'fs-caption', 'fs-small', 'fs-body', 'fs-lead', 'fs-card-title', 'fs-title', 'fs-h1', 'fs-display', 'fs-price',
      'dur-micro', 'dur-short', 'dur-enter', 'dur-complex', 'ease-out', 'ease-in', 'ease-in-out', 'ease-standard',
    ];
    for (const name of required) expect(light, `--${name}`).toHaveProperty(name);
  });

  it('keeps the motion language inside the agreed ranges', () => {
    const ms = (name: string) => Number.parseInt(light[name], 10);
    expect(ms('dur-micro')).toBeGreaterThanOrEqual(120);
    expect(ms('dur-short')).toBeLessThanOrEqual(250);
    expect(ms('dur-enter')).toBeGreaterThanOrEqual(350);
    expect(ms('dur-enter')).toBeLessThanOrEqual(650);
    expect(ms('dur-complex')).toBeGreaterThanOrEqual(500);
    expect(ms('dur-complex')).toBeLessThanOrEqual(900);
  });

  it('is light by default regardless of the OS colour scheme', () => {
    expect(lightBody).toMatch(/color-scheme\s*:\s*light\s*;/);
    // 'system' is resolved in JS (src/lib/ui/theme.ts) and only when selected: no stylesheet may
    // switch the theme from the operating system's setting on its own.
    for (const file of walk(APP_DIR, '.css')) {
      expect(stripComments(readFileSync(file, 'utf8')), file).not.toMatch(/prefers-color-scheme/);
    }
  });

  it('paints the browser chrome in the page colour of each theme', () => {
    expect(THEME_COLORS.light).toBe(resolve(light, 'bg'));
    expect(THEME_COLORS.dark).toBe(resolve({ ...light, ...dark }, 'bg'));
  });

  it('redefines every colour token in the dark theme (artwork colours excepted)', () => {
    // --art-* are the colours of the generative artwork: the same in both themes, like a photo.
    const colourTokens = Object.keys(light).filter((k) => /^#/.test(light[k]) && !k.startsWith('art-'));
    expect(colourTokens.length).toBeGreaterThan(20);
    for (const name of colourTokens) expect(dark, `--${name} in dark`).toHaveProperty(name);
    for (const name of Object.keys(dark)) expect(name.startsWith('art-'), `--${name} must not change per theme`).toBe(false);
  });

  for (const [theme, tokens] of themes) {
    describe(theme, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        it(`--${fg} on --${bg} >= 4.5:1`, () => {
          expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const [fg, bg] of UI_PAIRS) {
        it(`--${fg} against --${bg} >= 3:1`, () => {
          expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});

describe('generative posters', () => {
  const posterCss = stripComments(readFileSync(join(APP_DIR, '_components', 'poster.css'), 'utf8'));
  const palettes = [...posterCss.matchAll(/\.poster--([a-z]+)\s*\{([^}]*--p-bg[^}]*)\}/g)].map((m) => ({ name: m[1], tokens: declarations(m[2]) }));
  const value = (raw: string) => {
    const ref = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(raw);
    return (ref ? resolve(light, ref[1]) : raw).toLowerCase();
  };

  it('finds the five palettes', () => {
    expect(palettes.map((p) => p.name).sort()).toEqual(['cielo', 'marea', 'menta', 'noche', 'papel']);
  });

  // Regression: on the paper palette the big disc was drawn in the colour of the type and
  // swallowed the event name printed over it.
  for (const { name, tokens } of palettes) {
    it(`${name}: no shape shares the colour of the type`, () => {
      const ink = value(tokens['p-ink']);
      expect(value(tokens['p-a'])).not.toBe(ink);
      expect(value(tokens['p-b'])).not.toBe(ink);
    });

    it(`${name}: the type stands out on the field and on both shapes (large text, >= 3:1 on the field)`, () => {
      const ink = value(tokens['p-ink']);
      expect(contrast(ink, value(tokens['p-bg']))).toBeGreaterThanOrEqual(3);
      expect(contrast(ink, value(tokens['p-a']))).toBeGreaterThan(1.3);
      expect(contrast(ink, value(tokens['p-b']))).toBeGreaterThan(1.3);
    });
  }
});

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

describe('CSP-ready markup and styles', () => {
  const tsx = walk(APP_DIR, '.tsx');
  const cssFiles = walk(APP_DIR, '.css');

  it('finds the files it guards', () => {
    expect(tsx.length).toBeGreaterThan(10);
    expect(cssFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('has no inline style attributes or <style> tags in TSX', () => {
    const offenders = tsx.filter((f) => /\sstyle\s*=|<style[\s>]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('has no <text> elements in inline SVG (no font dependency)', () => {
    const offenders = tsx.filter((f) => /<text[\s>]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('loads no remote CSS, fonts or images from stylesheets', () => {
    const offenders = cssFiles.filter((f) => {
      const source = stripComments(readFileSync(f, 'utf8'));
      return /@import|url\(\s*['"]?(https?:)?\/\//i.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it('gives the only inline script (the theme bootstrap) the request nonce', () => {
    const withInlineScript = tsx.filter((f) => /<script[\s>]/.test(readFileSync(f, 'utf8')));
    expect(withInlineScript.map((f) => f.replace(/\\/g, '/').split('/src/app/')[1])).toEqual(['_components/theme-script.tsx']);
    expect(readFileSync(withInlineScript[0], 'utf8')).toMatch(/<script nonce=\{nonce\}/);
  });

  it('loads self-hosted fonts only: Geist Sans from the geist package and Archivo Black from a local file', () => {
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/from 'geist\/font\/sans'/);
    expect(layout).not.toMatch(/from 'geist\/font\/mono'/);
    expect(layout).toMatch(/from 'next\/font\/local'/);
    expect(layout).toMatch(/\.\/fonts\/ArchivoBlack-Regular\.ttf/);
    for (const f of [...tsx, ...walk(APP_DIR, '.ts')]) expect(readFileSync(f, 'utf8'), f).not.toMatch(/next\/font\/google/);
  });
});
