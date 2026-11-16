import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Design-system guard rails: every text/background token pair meets WCAG AA in both themes, and the
// markup stays ready for a strict Content-Security-Policy (no inline styles, no remote CSS/fonts).

const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(join(APP_DIR, 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-2'],
  ['brand-contrast', 'brand'],
  ['brand-contrast', 'brand-hover'],
  ['accent-contrast', 'accent'],
  ['accent-contrast', 'accent-hover'],
  ['on-pastel', 'accent'],
  ['on-pastel', 'success-fill'],
  ['on-pastel', 'warning-fill'],
  // Big pastel blocks (cards, hero panels, illustration circles) carry near-black text.
  ['on-pastel', 'sky'],
  ['on-pastel', 'sky-soft'],
  ['on-pastel', 'sky-deep'],
  ['on-pastel', 'mint'],
  ['on-pastel', 'mint-soft'],
  ['on-pastel', 'mint-deep'],
  ['on-pastel', 'pink'],
  ['on-pastel', 'pink-soft'],
  ['on-pastel', 'pink-deep'],
  ['on-pastel-muted', 'sky'],
  ['on-pastel-muted', 'sky-soft'],
  ['on-pastel-muted', 'mint'],
  ['on-pastel-muted', 'mint-soft'],
  ['on-pastel-muted', 'pink'],
  ['on-pastel-muted', 'pink-soft'],
  ['feature-text', 'feature-tag-bg'],
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
  ['feature-text', 'feature-bg'],
  ['feature-muted', 'feature-bg'],
  ['text', 'nav-active-bg'],
];

// Non-text UI (WCAG 1.4.11): focus indicators and form-control boundaries.
const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['border-strong', 'bg'],
  ['border-strong', 'surface'],
];

describe('design tokens', () => {
  it('defines the required token set in the light theme', () => {
    const required = [
      'bg', 'surface', 'surface-2', 'border', 'border-strong', 'text', 'text-muted',
      'brand', 'brand-hover', 'brand-contrast', 'accent', 'accent-hover', 'accent-contrast', 'on-pastel',
      'success', 'success-soft', 'success-fill', 'warning', 'warning-soft', 'warning-fill',
      'danger', 'danger-soft', 'info', 'info-soft', 'link', 'focus', 'feature-bg', 'feature-text',
      'feature-muted', 'feature-tag-bg', 'nav-active-bg', 'shadow-sm', 'shadow-lg',
      'sky', 'sky-soft', 'sky-deep', 'mint', 'mint-soft', 'mint-deep', 'pink', 'pink-soft', 'pink-deep',
      'on-pastel-muted',
      'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-pill',
      'space-1', 'space-2', 'space-3', 'space-4', 'space-6', 'space-8',
      'fs-caption', 'fs-small', 'fs-body', 'fs-card-title', 'fs-title', 'fs-display', 'fs-price',
    ];
    for (const name of required) expect(light, `--${name}`).toHaveProperty(name);
  });

  it('is light by default regardless of the OS colour scheme', () => {
    expect(lightBody).toMatch(/color-scheme\s*:\s*light\s*;/);
    expect(css).not.toMatch(/prefers-color-scheme/);
  });

  it('redefines every colour token in the dark theme', () => {
    const colourTokens = Object.keys(light).filter((k) => /^#/.test(light[k]));
    expect(colourTokens.length).toBeGreaterThan(20);
    for (const name of colourTokens) expect(dark, `--${name} in dark`).toHaveProperty(name);
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
      const source = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      return /@import|url\(\s*['"]?(https?:)?\/\//i.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
