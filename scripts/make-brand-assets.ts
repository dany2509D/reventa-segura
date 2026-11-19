// Usage: npx tsx scripts/make-brand-assets.ts
// Regenerates the brand files in public/ that browsers, phones and social networks ask for by name:
//   favicon.ico (16/32/48, PNG-compressed entries), favicon.svg, apple-touch-icon.png (180×180)
//   og-default.png (1200×630: the preview card of links shared on WhatsApp, Facebook, X, LinkedIn…)
// The tab/home-screen icons use the same mark as the header logo (ink tile, ivory ticket, cobalt check). The
// preview card is drawn with shapes plus text laid out by next/og (Satori) from the Geist files shipped
// in node_modules (the same family the site uses), so it does not depend on fonts installed here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { createElement as h } from 'react';
import sharp from 'sharp';

// Palette of the current design (src/app/globals.css: --art-ink, --art-ink-2, --art-white, --art-sky, --art-mint).
const INK = '#0F0F12';
const INK_2 = '#1A1A20';
const WHITE = '#EDEAE3'; // warm ivory
const COBALT = '#4D96FF';
const RASPBERRY = '#FF3D6E';
const MUTED = '#A8A59E';

const publicDir = join(process.cwd(), 'public');
const fonts = join(process.cwd(), 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans');
mkdirSync(publicDir, { recursive: true });

// ---- Mark (32×32 grid, same paths as BrandMark in src/app/_components/icons.tsx) -----------------
const TICKET = 'M8.5 9H23.5A2.5 2.5 0 0 1 26 11.5V13.4A2.6 2.6 0 0 0 26 18.6V20.5A2.5 2.5 0 0 1 23.5 23H8.5A2.5 2.5 0 0 1 6 20.5V18.6A2.6 2.6 0 0 0 6 13.4V11.5A2.5 2.5 0 0 1 8.5 9Z';
const CHECK = 'M12 16.2L14.8 19L20.2 13.2';
const TILE = 'M8 0H24A8 8 0 0 1 32 8V24A8 8 0 0 1 24 32H8A8 8 0 0 1 0 24V8A8 8 0 0 1 8 0Z';

const markSvg = (size: number, tile: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
  (tile ? `<path d="${TILE}" fill="${INK}"/>` : `<rect width="32" height="32" fill="${INK}"/>`) +
  `<path d="${TICKET}" fill="none" stroke="${WHITE}" stroke-width="1.7" stroke-linejoin="round"/>` +
  `<path d="${CHECK}" fill="none" stroke="${COBALT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// favicon.svg: scales to any size, so it carries a viewBox and no fixed pixel size.
writeFileSync(join(publicDir, 'favicon.svg'), markSvg(32, true).replace(' width="32" height="32"', '') + '\n');
console.log('wrote favicon.svg');

// apple-touch-icon.png: iOS rounds the corners itself, so the tile is full-bleed.
await sharp(Buffer.from(markSvg(180, false)), { density: 288 }).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));
console.log('wrote apple-touch-icon.png');

// favicon.ico: an ICO file is a small directory followed by the images; PNG entries are valid.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(markSvg(s, true)), { density: 72 * (256 / s) }).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); // width
  e.writeUInt8(s, 1); // height
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log('wrote favicon.ico');

// ---- Social preview card -------------------------------------------------------------------------
const W = 1200;
const H = 630;

// A large ticket (notched sides, perforation) on the right, in outline: the one motif of the brand.
const tx = 700, ty = 150, tw = 400, th = 330, tr = 36, nr = 34;
const cy = ty + th / 2;
const bigTicket =
  `M${tx + tr},${ty} H${tx + tw - tr} A${tr},${tr} 0 0 1 ${tx + tw},${ty + tr} V${cy - nr} A${nr},${nr} 0 0 0 ${tx + tw},${cy + nr} ` +
  `V${ty + th - tr} A${tr},${tr} 0 0 1 ${tx + tw - tr},${ty + th} H${tx + tr} A${tr},${tr} 0 0 1 ${tx},${ty + th - tr} V${cy + nr} ` +
  `A${nr},${nr} 0 0 0 ${tx},${cy - nr} V${ty + tr} A${tr},${tr} 0 0 1 ${tx + tr},${ty} Z`;
const px = tx + tw * 0.7; // perforation
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${INK}"/><stop offset="1" stop-color="${INK_2}"/></linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${COBALT}"/><stop offset="1" stop-color="${RASPBERRY}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <path d="${bigTicket}" fill="${INK_2}" stroke="url(#a)" stroke-width="6" stroke-linejoin="round"/>
  <path d="M${px},${ty + 28} V${ty + th - 28}" stroke="${MUTED}" stroke-width="3" stroke-dasharray="3 14" stroke-linecap="round" opacity="0.7"/>
  <path d="M${tx + 78},${cy + 6} L${tx + 130},${cy + 56} L${tx + 236},${cy - 56}" fill="none" stroke="url(#a)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="80" y="${H - 14}" width="${W - 160}" height="4" rx="2" fill="url(#a)" opacity="0.9"/>
  <g transform="translate(80 78) scale(2)"><path d="${TILE}" fill="${INK_2}" stroke="${MUTED}" stroke-opacity="0.35" stroke-width="0.6"/>
    <path d="${TICKET}" fill="none" stroke="${WHITE}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="${CHECK}" fill="none" stroke="${COBALT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`;

const geist = (file: string) => readFileSync(join(fonts, file));
const base = { fontFamily: 'Geist', display: 'flex' } as const;
// Transparent text layer, same size as the card; placed over the drawing below.
const textLayer = new ImageResponse(
  h(
    'div',
    { style: { ...base, position: 'relative', width: W, height: H } },
    h(
      'div',
      { style: { ...base, position: 'absolute', left: 162, top: 78, height: 64, alignItems: 'center', fontSize: 34, fontWeight: 700, color: WHITE } },
      'reventa',
      h('span', { style: { color: COBALT } }, 'segura'),
    ),
    h(
      'div',
      { style: { ...base, position: 'absolute', left: 80, top: 205, width: 580, flexDirection: 'column' } },
      h('div', { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.08, color: WHITE, letterSpacing: -1.5 } }, 'Entradas de reventa en Panamá, con pago protegido'),
      h('div', { style: { fontSize: 30, fontWeight: 400, lineHeight: 1.3, color: MUTED, marginTop: 26 } }, 'El vendedor cobra después del evento.'),
    ),
  ),
  {
    width: W,
    height: H,
    fonts: [
      { name: 'Geist', data: geist('Geist-Bold.ttf'), weight: 700, style: 'normal' },
      { name: 'Geist', data: geist('Geist-Regular.ttf'), weight: 400, style: 'normal' },
    ],
  },
);

await sharp(Buffer.from(bg))
  .composite([{ input: Buffer.from(await textLayer.arrayBuffer()), left: 0, top: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(join(publicDir, 'og-default.png'));
console.log('wrote og-default.png');
