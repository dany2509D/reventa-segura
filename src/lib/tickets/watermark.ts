import sharp from 'sharp';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { MAX_IMAGE_SIDE, detectType } from '@/lib/uploads/uploads';

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// The XML 1.0 Char production: excludes control chars, U+FFFE/FFFF and lone surrogates.
function isXmlChar(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

/** Makes arbitrary text safe to place inside an SVG/XML text node or attribute value. */
export function escapeXml(s: string): string {
  return Array.from(s)
    .filter((ch) => isXmlChar(ch.codePointAt(0)!))
    .join('')
    .replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

function sharpError(e: unknown): InvalidUploadError {
  const msg = e instanceof Error ? e.message : '';
  return new InvalidUploadError(/pixel limit/i.test(msg) ? 'too_many_pixels' : 'corrupt');
}

// Diagonal, semi-transparent text repeated over the whole image in a brick layout. Dark fill
// with a light outline stays visible on both light and dark tickets.
function overlaySvg(width: number, height: number, text: string): string {
  const fs = Math.min(96, Math.max(10, Math.round(Math.min(width, height) / 14)));
  const tileW = Math.ceil(text.length * fs * 0.62 + fs * 2);
  const rowH = Math.round(fs * 2.5);
  const stroke = Math.max(1, Math.round(fs / 12));
  const style =
    `font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="bold" ` +
    `fill="#000000" fill-opacity="0.3" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${stroke}"`;
  const label = escapeXml(text);
  // Second row is shifted half a tile; its two clipped copies join across neighbouring tiles.
  const half = Math.round(tileW / 2);
  const second = rowH + Math.round(fs * 1.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="wm" patternUnits="userSpaceOnUse" width="${tileW}" height="${rowH * 2}" patternTransform="rotate(-30)">` +
    `<text x="${fs}" y="${Math.round(fs * 1.5)}" ${style}>${label}</text>` +
    `<text x="${fs - half}" y="${second}" ${style}>${label}</text>` +
    `<text x="${fs + half}" y="${second}" ${style}>${label}</text>` +
    `</pattern></defs>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#wm)"/>` +
    `</svg>`
  );
}

/**
 * Burns `text` into a JPEG/PNG/WebP image as a tiled diagonal watermark and returns a freshly
 * encoded JPEG of the same (EXIF-oriented) dimensions, without metadata.
 * Throws InvalidUploadError for anything that is not a decodable raster image.
 */
export async function watermark(image: Buffer, text: string): Promise<Buffer> {
  // Content sniffing first: SVG, PDF and other formats sharp might decode are refused.
  const type = detectType(image);
  if (!type || type === 'pdf') throw new InvalidUploadError('unsupported_type');

  const opts = { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE, failOn: 'warning' as const };
  const meta = await sharp(image, opts)
    .metadata()
    .catch((e: unknown) => {
      throw sharpError(e);
    });
  if (meta.format !== type || !meta.width || !meta.height) throw new InvalidUploadError('corrupt');

  // EXIF orientations 5-8 swap the axes once rotate() bakes them in.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;

  try {
    return await sharp(image, opts)
      .rotate()
      .flatten({ background: '#ffffff' })
      .composite([{ input: Buffer.from(overlaySvg(width, height, text), 'utf8'), top: 0, left: 0 }])
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    throw sharpError(e);
  }
}
