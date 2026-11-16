import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { GLYPHS, MIN_OVERLAY_COVERAGE, labelPath, overlaySvg, renderOverlay } from './overlay';
import { WatermarkError, watermark } from './watermark';

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

    // If the label were spliced into the SVG, this would paint a full-size red rectangle.
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

  it('rejects an image wider or taller than 8000 px with InvalidUploadError', async () => {
    for (const [w, h] of [
      [8001, 10],
      [10, 8001],
    ]) {
      const big = await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer();
      const err = await watermark(big, TEXT).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidUploadError);
      expect((err as InvalidUploadError).reason).toBe('too_many_pixels');
    }
  });

  it('fails closed with WatermarkError when the label would draw nothing', async () => {
    await expect(watermark(white, '')).rejects.toBeInstanceOf(WatermarkError);
    await expect(watermark(white, '    ')).rejects.toBeInstanceOf(WatermarkError);
  });

  it('fails closed on an image too small to carry a visible label', async () => {
    await expect(watermark(await solid(2, 2), TEXT)).rejects.toBeInstanceOf(WatermarkError);
  });
});

describe('overlay', () => {
  it('covers well above the fail-closed threshold for a normal label', async () => {
    for (const [w, h] of [
      [320, 240],
      [64, 48],
      [1080, 1920],
    ]) {
      const { coverage } = await renderOverlay(w, h, TEXT);
      expect(coverage).toBeGreaterThan(MIN_OVERLAY_COVERAGE * 10);
      expect(coverage).toBeLessThan(0.5);
    }
    expect((await renderOverlay(320, 240, '')).coverage).toBe(0);
  });

  it('is pure vector geometry: no text, font or external reference in the SVG', () => {
    const svg = overlaySvg(320, 240, TEXT);
    const elements = new Set([...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]));
    expect([...elements].sort()).toEqual(['defs', 'g', 'path', 'pattern', 'rect', 'svg']);
    expect(svg).not.toMatch(/font|<text|<tspan|textPath|href|<image|<style/i);
  });

  it('has a glyph for every label character and falls back to "?" for anything else', () => {
    for (const ch of '0123456789abcdef+…·- ?') expect(GLYPHS[ch], ch).toBeDefined();
    for (const ch of '0123456789abcdef+…·-?') expect(GLYPHS[ch].length, ch).toBeGreaterThan(0);
    expect(labelPath('A').d).toBe(labelPath('a').d);
    expect(labelPath('Z').d).toBe(labelPath('?').d);
    expect(labelPath('<').d).toBe(labelPath('?').d);
    expect(labelPath('ab').d).not.toBe(labelPath('ba').d);
  });

  describe('font independence', () => {
    let noFonts: string;
    beforeAll(() => {
      noFonts = mkdtempSync(join(tmpdir(), 'no-fonts-'));
    });
    afterAll(() => rmSync(noFonts, { recursive: true, force: true }));

    // A fresh Node process whose fontconfig sees an empty config: on Linux (Vercel) that leaves
    // no fonts at all. It renders the production overlay (Node strips the TS types natively) plus a
    // <text> control that reports whether fonts were actually hidden on this platform.
    it('draws distinct, covering overlays in a process that cannot load fonts', () => {
      const child = `
        const { createHash } = await import('node:crypto');
        const sharp = (await import('sharp')).default;
        const { renderOverlay } = await import(process.env.OVERLAY_URL);
        const hash = (b) => createHash('sha256').update(b).digest('hex');
        const a = await renderOverlay(400, 300, '+507…4567 · ab12cd34');
        const b = await renderOverlay(400, 300, '+507…9876 · 0f9e8d7c');
        const text = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">' +
          '<text x="5" y="45" font-family="sans-serif" font-size="40">Hola 123</text></svg>');
        const raw = await sharp(text).ensureAlpha().raw().toBuffer();
        let control = 0;
        for (let i = 3; i < raw.length; i += 4) if (raw[i]) control++;
        console.log(JSON.stringify({
          a: { coverage: a.coverage, hash: hash(a.data) },
          b: { coverage: b.coverage, hash: hash(b.data) },
          control,
        }));
      `;
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        FONTCONFIG_PATH: noFonts,
        FONTCONFIG_FILE: join(noFonts, 'missing-fonts.conf'),
        PANGOCAIRO_BACKEND: 'fc',
        OVERLAY_URL: new URL('./overlay.ts', import.meta.url).href,
      };
      delete env.NODE_OPTIONS;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', child], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const res = JSON.parse(out.trim().split('\n').pop()!) as {
        a: { coverage: number; hash: string };
        b: { coverage: number; hash: string };
        control: number;
      };
      expect(res.a.coverage).toBeGreaterThan(MIN_OVERLAY_COVERAGE);
      expect(res.b.coverage).toBeGreaterThan(MIN_OVERLAY_COVERAGE);
      expect(res.a.hash).not.toBe(res.b.hash);
      // Where the env really hides fonts (Linux), a <text> renders nothing while the overlay still
      // draws. Windows' pango ignores it (control > 0); the SVG test above covers that platform.
      if (process.platform === 'linux') expect(res.control).toBe(0);
    }, 60_000); // spawns a Node process that loads sharp: slow on a busy machine
  });
});
