import sharp from 'sharp';

// Watermark overlay drawn from a built-in stroke font: plain SVG <path> geometry, so rendering
// never needs a system or bundled font (serverless Linux runtimes ship none).
// Keep this module dependency-free apart from sharp and limited to erasable TypeScript: a test
// imports it in a bare Node process (native type stripping) with fonts hidden.

/** Below this fraction of non-transparent pixels the label did not draw: fail closed. */
export const MIN_OVERLAY_COVERAGE = 0.002;

export class WatermarkError extends Error {
  constructor(message = 'The watermark could not be drawn') {
    super(message);
    this.name = 'WatermarkError';
  }
}

// Glyph box: x 0..4, y 0..6 (y down, baseline at 6, x-height at 2). Each stroke is a polyline
// [x0, y0, x1, y1, ...]; a dot is a tiny closed square that the stroke width fills in.
const dot = (x: number, y: number): number[] => [
  x - 0.3, y - 0.3, x + 0.3, y - 0.3, x + 0.3, y + 0.3, x - 0.3, y + 0.3, x - 0.3, y - 0.3,
];

/** Exactly the label alphabet (masked phone, separator, short order id) plus the `?` fallback. */
export const GLYPHS: Readonly<Record<string, readonly (readonly number[])[]>> = {
  '0': [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0], [3.2, 1.2, 0.8, 4.8]],
  '1': [[0.8, 1.2, 2, 0, 2, 6], [0.8, 6, 3.2, 6]],
  '2': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2.2, 0, 6, 4, 6]],
  '3': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1.5, 3], [3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  '4': [[3, 6, 3, 0, 0, 4, 4, 4]],
  '5': [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  '6': [[3.5, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  '7': [[0, 0, 4, 0, 1.5, 6]],
  '8': [
    [1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3, 0, 2, 0, 1, 1, 0],
    [1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3],
  ],
  '9': [[4, 3, 1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 0.5, 6]],
  a: [[0.5, 2, 3, 2, 4, 3, 4, 6], [4, 4, 1, 4, 0, 5, 1, 6, 4, 6]],
  b: [[0, 0, 0, 6, 3, 6, 4, 5, 4, 3, 3, 2, 0, 2]],
  c: [[4, 2, 1, 2, 0, 3, 0, 5, 1, 6, 4, 6]],
  d: [[4, 0, 4, 6, 1, 6, 0, 5, 0, 3, 1, 2, 4, 2]],
  e: [[0, 4, 4, 4, 4, 3, 3, 2, 1, 2, 0, 3, 0, 5, 1, 6, 4, 6]],
  f: [[4, 0.3, 3.5, 0, 2.5, 0, 1.5, 1, 1.5, 6], [0, 2.5, 3.5, 2.5]],
  '+': [[2, 1.5, 2, 5.5], [0, 3.5, 4, 3.5]],
  '-': [[0.5, 3.5, 3.5, 3.5]],
  '·': [dot(2, 3.5)],
  '…': [dot(0.4, 5.6), dot(2, 5.6), dot(3.6, 5.6)],
  ' ': [],
  '?': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 2, 3.5, 2, 4.3], dot(2, 5.7)],
};

const GLYPH_HEIGHT = 6;
const ADVANCE = 6; // 4-unit glyph + 2-unit gap

const num = (v: number) => String(Math.round(v * 100) / 100);

/** SVG path data for `text` in glyph units, and its width in the same units. */
export function labelPath(text: string): { d: string; width: number } {
  const parts: string[] = [];
  const chars = Array.from(text);
  chars.forEach((ch, i) => {
    const strokes = GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS['?'];
    const dx = i * ADVANCE;
    for (const s of strokes) {
      const pts: string[] = [];
      for (let k = 0; k < s.length; k += 2) pts.push(`${num(s[k] + dx)} ${num(s[k + 1])}`);
      parts.push(`M${pts.join('L')}`);
    }
  });
  return { d: parts.join(''), width: Math.max(0, chars.length * ADVANCE - 2) };
}

/**
 * Full-size transparent SVG with the label tiled diagonally (-30°) in a brick layout: a light
 * outline under a dark stroke, both semi-transparent, readable on light and dark tickets.
 */
export function overlaySvg(width: number, height: number, text: string): string {
  const fs = Math.min(96, Math.max(10, Math.round(Math.min(width, height) / 14)));
  const unit = (fs * 0.72) / GLYPH_HEIGHT; // px per glyph unit
  const { d, width: labelW } = labelPath(text);
  const tileW = Math.ceil(labelW * unit + fs * 2);
  const rowH = Math.round(fs * 2.5);
  const half = Math.round(tileW / 2);
  const top = Math.round(fs * 0.75);
  const stroke = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const label = (x: number, y: number) =>
    d === ''
      ? ''
      : `<g transform="translate(${x} ${y}) scale(${num(unit)})">` +
        `<path d="${d}" ${stroke} stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/>` +
        `<path d="${d}" ${stroke} stroke="#000000" stroke-opacity="0.3" stroke-width="0.8"/>` +
        `</g>`;
  // The second row is shifted half a tile; its two clipped copies join across neighbouring tiles.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="wm" patternUnits="userSpaceOnUse" width="${tileW}" height="${rowH * 2}" patternTransform="rotate(-30)">` +
    label(fs, top) +
    label(fs - half, rowH + top) +
    label(fs + half, rowH + top) +
    `</pattern></defs>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#wm)"/>` +
    `</svg>`
  );
}

/**
 * Rasterizes the overlay on its own transparent canvas: raw RGBA (unpremultiplied) plus the
 * fraction of pixels it touches, so the caller can refuse to ship an unmarked copy.
 */
export async function renderOverlay(
  width: number,
  height: number,
  text: string,
): Promise<{ data: Buffer; coverage: number }> {
  const { data, info } = await sharp(Buffer.from(overlaySvg(width, height, text), 'utf8'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new WatermarkError('The watermark overlay could not be rendered');
    });
  if (info.width !== width || info.height !== height || info.channels !== 4) {
    throw new WatermarkError('The watermark overlay has an unexpected size');
  }
  let covered = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) covered++;
  return { data, coverage: covered / (width * height) };
}
