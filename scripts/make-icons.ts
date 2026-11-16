// Usage: npx tsx scripts/make-icons.ts — regenerates public/icons/*.png from the SVG below.
// Shapes only (no text): rendering must not depend on installed fonts.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const GREEN = '#0b6b4f';

// A ticket with side notches and a check mark. `pad` is the safe margin (maskable icons need ~20%).
function svg(size: number, pad: number, rounded: boolean): string {
  const s = size;
  const x0 = pad, x1 = s - pad;
  const y0 = s * 0.3, y1 = s * 0.7;
  const r = s * 0.06; // notch radius
  const ym = (y0 + y1) / 2;
  const bg = rounded ? `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${GREEN}"/>` : `<rect width="${s}" height="${s}" fill="${GREEN}"/>`;
  const ticket =
    `M${x0 + r},${y0} H${x1 - r} A${r},${r} 0 0 0 ${x1},${y0 + r} V${ym - r} A${r},${r} 0 0 1 ${x1},${ym + r} ` +
    `V${y1 - r} A${r},${r} 0 0 0 ${x1 - r},${y1} H${x0 + r} A${r},${r} 0 0 0 ${x0},${y1 - r} V${ym + r} ` +
    `A${r},${r} 0 0 1 ${x0},${ym - r} V${y0 + r} A${r},${r} 0 0 0 ${x0 + r},${y0} Z`;
  const cx = s / 2, cy = ym, k = s * 0.07;
  const check = `M${cx - 2 * k},${cy} L${cx - 0.5 * k},${cy + 1.5 * k} L${cx + 2.4 * k},${cy - 1.8 * k}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${bg}` +
    `<path d="${ticket}" fill="#ffffff"/>` +
    `<path d="${check}" fill="none" stroke="${GREEN}" stroke-width="${s * 0.045}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

const out = join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });
const jobs: [string, number, number, boolean][] = [
  ['icon-192.png', 192, 192 * 0.14, true],
  ['icon-512.png', 512, 512 * 0.14, true],
  ['icon-maskable-512.png', 512, 512 * 0.26, false], // full-bleed, content inside the safe zone
];
for (const [name, size, pad, rounded] of jobs) {
  await sharp(Buffer.from(svg(size, pad, rounded))).png().toFile(join(out, name));
  console.log('wrote', name);
}
