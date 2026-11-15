import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { escapeXml, watermark } from './watermark';

const TEXT = '+507…4567 · ab12cd34';

async function solid(width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png') {
  const img = sharp({ create: { width, height, channels: 3, background: '#ffffff' } });
  if (format === 'png') return img.png().toBuffer();
  if (format === 'jpeg') return img.jpeg({ quality: 95 }).toBuffer();
  return img.webp({ quality: 95 }).toBuffer();
}

/** Per-channel means of the decoded pixels (alpha dropped). */
async function channelMeans(buf: Buffer): Promise<number[]> {
  const stats = await sharp(buf).removeAlpha().stats();
  return stats.channels.map((c) => c.mean);
}

let white: Buffer;
beforeAll(async () => {
  white = await solid(320, 240);
});

describe('watermark', () => {
  it('returns a different, decodable JPEG of identical dimensions', async () => {
    const out = await watermark(white, TEXT);
    expect(out.equals(white)).toBe(false);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(240);
  });

  it('actually draws the overlay (pixels darker than the plain re-encode)', async () => {
    const plain = await sharp(white).jpeg().toBuffer();
    const [r0] = await channelMeans(plain);
    const [r1] = await channelMeans(await watermark(white, TEXT));
    expect(r0).toBeGreaterThan(250);
    expect(r1).toBeLessThan(r0 - 1);
  });

  it('accepts JPEG and WebP input and keeps their dimensions', async () => {
    for (const format of ['jpeg', 'webp'] as const) {
      const out = await watermark(await solid(97, 211, format), TEXT);
      const meta = await sharp(out).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 97, 211]);
    }
  });

  it('works on tiny images', async () => {
    const out = await watermark(await solid(4, 3), TEXT);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([4, 3]);
  });

  it('flattens transparency instead of failing', async () => {
    const rgba = await sharp({
      create: { width: 50, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const meta = await sharp(await watermark(rgba, TEXT)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 50, 40]);
  });

  it('treats markup in the text as text: & and <script> neither break nor inject', async () => {
    const out1 = await watermark(white, 'A & B <script>alert(1)</script> "x" \'y\'');
    expect((await sharp(out1).metadata()).format).toBe('jpeg');

    // Unescaped, this would close the <text> and paint a full-size red rectangle.
    const payload =
      '</text></pattern></defs><rect x="0" y="0" width="100%" height="100%" fill="#ff0000"/><defs><pattern><text>';
    const [r, g, b] = await channelMeans(await watermark(white, payload));
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
    expect(Math.abs(r - g)).toBeLessThan(15);
  });

  it('strips metadata from the output', async () => {
    const tagged = await sharp(white).withExif({ IFD0: { Artist: 'SECRET-SELLER' } }).png().toBuffer();
    const out = await watermark(tagged, TEXT);
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.includes('SECRET-SELLER')).toBe(false);
  });

  it('rejects non-images with InvalidUploadError', async () => {
    await expect(watermark(Buffer.from('hello world'), TEXT)).rejects.toBeInstanceOf(InvalidUploadError);
    await expect(watermark(Buffer.alloc(0), TEXT)).rejects.toBeInstanceOf(InvalidUploadError);
    await expect(watermark(Buffer.from('%PDF-1.7\n%%EOF\n'), TEXT)).rejects.toBeInstanceOf(InvalidUploadError);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(watermark(svg, TEXT)).rejects.toBeInstanceOf(InvalidUploadError);
  });

  it('rejects a corrupt image with InvalidUploadError', async () => {
    const truncated = white.subarray(0, 40);
    await expect(watermark(truncated, TEXT)).rejects.toBeInstanceOf(InvalidUploadError);
  });
});

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });

  it('drops characters that are not allowed in XML', () => {
    expect(escapeXml('a\u0000b\u0007c￾d')).toBe('abcd');
  });
});
