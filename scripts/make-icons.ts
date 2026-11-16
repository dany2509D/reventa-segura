// Usage: npx tsx scripts/make-icons.ts — regenerates public/icons/*.png from the SVG below.
// Shapes only (no text): rendering must not depend on installed fonts.
// Same mark as the header logo (src/app/_components/icons.tsx): ink tile, white ticket outline, sky check.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const INK = '#141416';
const WHITE = '#ffffff';
const SKY = '#8fdcf5';

// `w` is the ticket width as a fraction of the icon; maskable icons keep it inside the 80% safe circle.
function svg(size: number, w: number, rounded: boolean): string {
  const s = size;
  const tw = s * w, th = tw * 0.7;
  const cx = s / 2, cy = s / 2;
  const x0 = cx - tw / 2, x1 = cx + tw / 2, y0 = cy - th / 2, y1 = cy + th / 2;
  const cr = tw * 0.125; // corner radius
  const nr = tw * 0.13; // side notch radius
  const stroke = tw * 0.11;
  const ticket =
    `M${x0 + cr},${y0} H${x1 - cr} A${cr},${cr} 0 0 1 ${x1},${y0 + cr} V${cy - nr} A${nr},${nr} 0 0 0 ${x1},${cy + nr} ` +
    `V${y1 - cr} A${cr},${cr} 0 0 1 ${x1 - cr},${y1} H${x0 + cr} A${cr},${cr} 0 0 1 ${x0},${y1 - cr} V${cy + nr} ` +
    `A${nr},${nr} 0 0 0 ${x0},${cy - nr} V${y0 + cr} A${cr},${cr} 0 0 1 ${x0 + cr},${y0} Z`;
  const k = tw / 20; // the header mark is drawn on a 20-unit-wide ticket
  const check = `M${cx - 4 * k},${cy + 0.2 * k} L${cx - 1.2 * k},${cy + 3 * k} L${cx + 4.2 * k},${cy - 2.8 * k}`;
  const bg = rounded
    ? `<rect width="${s}" height="${s}" rx="${s * 0.25}" fill="${INK}"/>`
    : `<rect width="${s}" height="${s}" fill="${INK}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${bg}` +
    `<path d="${ticket}" fill="none" stroke="${WHITE}" stroke-width="${stroke}" stroke-linejoin="round"/>` +
    `<path d="${check}" fill="none" stroke="${SKY}" stroke-width="${stroke * 1.2}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

const out = join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });
const jobs: [string, number, number, boolean][] = [
  ['icon-192.png', 192, 0.625, true],
  ['icon-512.png', 512, 0.625, true],
  ['icon-maskable-512.png', 512, 0.5, false], // full-bleed, content inside the safe zone
];
for (const [name, size, w, rounded] of jobs) {
  await sharp(Buffer.from(svg(size, w, rounded))).png().toFile(join(out, name));
  console.log('wrote', name);
}
