import { createHash } from 'node:crypto';
import jsQR from 'jsqr';
import sharp, { type Sharp } from 'sharp';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { MAX_IMAGE_SIDE, detectType } from '@/lib/uploads/uploads';

/*
 * Ticket fingerprints (anti double-listing, RF-08).
 *
 * - `qr:<sha256>`: hash of the trimmed QR payload. Any picture of the same QR (another
 *   screenshot, another size or format) yields the same value, so the same ticket cannot
 *   be listed twice while one listing is active.
 * - `img:<sha256>`: when no QR can be read, a hash of the decoded pixels normalised to a
 *   256x256 grayscale image. Re-saving the same picture in another lossless format or with
 *   different metadata still collides. This is a best-effort heuristic against accidental
 *   or lazy re-uploads only: any deliberate edit (crop, recompression, one changed pixel)
 *   produces a different value. It is not a security control; admin review remains.
 */

// Large photos are scanned downscaled: jsQR cost grows with the pixel count.
const QR_SCAN_MAX_SIDE = 1600;
const HEURISTIC_SIDE = 256;
const SHARP_OPTS = { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE };

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function isImage(buf: Buffer): boolean {
  const type = detectType(buf);
  return type === 'jpeg' || type === 'png' || type === 'webp';
}

// jsQR wants RGBA. sharp's raw output has 1 channel after grayscale() (which overrides the
// output colourspace) and 3 otherwise (alpha is flattened away), so expand it here.
function toRgba(data: Buffer, channels: number, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, s = 0; i < n; i++, s += channels) {
    const gray = channels < 3;
    out[i * 4] = data[s];
    out[i * 4 + 1] = data[gray ? s : s + 1];
    out[i * 4 + 2] = data[gray ? s : s + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

async function scan(img: Sharp): Promise<string | null> {
  const { data, info } = await img.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const pixels = toRgba(data, info.channels, info.width, info.height);
  const code = jsQR(pixels, info.width, info.height, { inversionAttempts: 'attemptBoth' });
  const payload = code?.data.trim();
  return payload ? payload : null;
}

/** The QR payload in a JPEG/PNG/WebP image, or null when there is none or it is not an image. */
export async function extractQrPayload(image: Buffer): Promise<string | null> {
  if (!isImage(image)) return null;
  const base = () =>
    sharp(image, SHARP_OPTS)
      .rotate()
      // A QR on a transparent background is dark-on-white once flattened.
      .flatten({ background: '#ffffff' })
      .resize({ width: QR_SCAN_MAX_SIDE, height: QR_SCAN_MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  try {
    // The original first; then a grayscale, contrast-stretched variant for faint codes.
    return (await scan(base())) ?? (await scan(base().grayscale().normalise()));
  } catch {
    return null;
  }
}

/** `qr:<hex>` when a QR is readable, else `img:<hex>` (see the module comment). */
export async function computeFingerprint(file: Buffer): Promise<string> {
  if (!isImage(file)) throw new InvalidUploadError('unsupported_type');
  const payload = await extractQrPayload(file);
  if (payload) return `qr:${sha256(payload)}`;
  try {
    const pixels = await sharp(file, { ...SHARP_OPTS, failOn: 'warning' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .grayscale()
      .resize(HEURISTIC_SIDE, HEURISTIC_SIDE, { fit: 'fill' })
      .raw({ depth: 'uchar' })
      .toBuffer();
    return `img:${sha256(pixels)}`;
  } catch {
    throw new InvalidUploadError('corrupt');
  }
}
