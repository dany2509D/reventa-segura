import sharp from 'sharp';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { MAX_IMAGE_SIDE, detectType } from '@/lib/uploads/uploads';
import { MIN_OVERLAY_COVERAGE, WatermarkError, renderOverlay } from './overlay';

export { WatermarkError } from './overlay';

function sharpError(e: unknown): InvalidUploadError {
  const msg = e instanceof Error ? e.message : '';
  return new InvalidUploadError(/pixel limit/i.test(msg) ? 'too_many_pixels' : 'corrupt');
}

/**
 * Burns `text` into a JPEG/PNG/WebP image as a tiled diagonal watermark and returns a freshly
 * encoded JPEG of the same (EXIF-oriented) dimensions, without metadata.
 * The label is drawn from built-in vector glyphs (no fonts). Throws InvalidUploadError for
 * anything that is not a decodable raster image of at most 8000 px per side, and WatermarkError
 * (fail closed) when the label would not visibly cover the image.
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
  // Same per-side rule as validateUpload.
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) throw new InvalidUploadError('too_many_pixels');

  const overlay = await renderOverlay(width, height, text);
  if (overlay.coverage < MIN_OVERLAY_COVERAGE) throw new WatermarkError();

  try {
    return await sharp(image, opts)
      .rotate()
      .flatten({ background: '#ffffff' })
      .composite([{ input: overlay.data, raw: { width, height, channels: 4 }, top: 0, left: 0 }])
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    throw sharpError(e);
  }
}
