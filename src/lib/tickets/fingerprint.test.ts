import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { computeFingerprint, extractQrPayload } from './fingerprint';
import { patternImage, qrPng, qrScreenshot } from './test-helpers';

// Image decoding and QR scanning are CPU-bound: leave headroom for a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const PAYLOAD = 'TKT-2026-ATLAPA-SEC-B-FILA-12-ASIENTO-7-9f2c1e';

describe('extractQrPayload', () => {
  it('reads the payload of a plain QR PNG', async () => {
    expect(await extractQrPayload(await qrPng(PAYLOAD))).toBe(PAYLOAD);
  });

  it('reads the payload of a QR inside a JPEG screenshot', async () => {
    expect(await extractQrPayload(await qrScreenshot(PAYLOAD))).toBe(PAYLOAD);
  });

  it('reads a WebP screenshot with a low-contrast QR', async () => {
    const img = await qrScreenshot(PAYLOAD, {
      format: 'webp',
      dark: '#555555ff',
      light: '#8a8a8aff',
      background: '#8a8a8a',
    });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('reads a faint QR that only the contrast-stretched variant can decode', async () => {
    // 16 grey levels apart: below jsQR's own minimum dynamic range.
    const img = await qrScreenshot(PAYLOAD, {
      format: 'png',
      dark: '#7a7a7aff',
      light: '#8a8a8aff',
      background: '#8a8a8a',
      banner: '#8a8a8a',
    });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('reads a QR drawn on a transparent background', async () => {
    const img = await qrPng(PAYLOAD, { dark: '#000000ff', light: '#00000000' });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('reads a light-on-dark (inverted) QR', async () => {
    const img = await qrPng(PAYLOAD, { dark: '#ffffffff', light: '#000000ff' });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('reads a QR in a large image (downscaled before scanning)', async () => {
    const img = await qrScreenshot(PAYLOAD, { width: 3000, height: 4000, qrSize: 1400, format: 'png' });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('returns null for an image without a QR', async () => {
    expect(await extractQrPayload(await patternImage(1).png().toBuffer())).toBeNull();
  });

  it('returns null for something that is not an image', async () => {
    expect(await extractQrPayload(Buffer.from('%PDF-1.7\n%%EOF\n'))).toBeNull();
    expect(await extractQrPayload(randomBytes(512))).toBeNull();
    expect(await extractQrPayload(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for a truncated image', async () => {
    const png = await qrPng(PAYLOAD);
    expect(await extractQrPayload(png.subarray(0, 40))).toBeNull();
  });
});

describe('computeFingerprint', () => {
  it('hashes the trimmed QR payload with a qr: prefix', async () => {
    const fp = await computeFingerprint(await qrPng(PAYLOAD));
    expect(fp).toBe(`qr:${sha256(PAYLOAD)}`);
    expect(fp).toMatch(/^qr:[0-9a-f]{64}$/);
    expect(await computeFingerprint(await qrPng(`  ${PAYLOAD}\n`))).toBe(fp);
  });

  it('gives the same fingerprint for different renderings of the same QR', async () => {
    const a = await computeFingerprint(await qrPng(PAYLOAD, { scale: 3 }));
    const b = await computeFingerprint(await qrScreenshot(PAYLOAD));
    const c = await computeFingerprint(
      await qrScreenshot(PAYLOAD, { width: 1080, height: 1920, qrSize: 600, left: 60, top: 900, format: 'png', banner: '#c0392b' }),
    );
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('gives different fingerprints for different QR payloads', async () => {
    const a = await computeFingerprint(await qrScreenshot(PAYLOAD));
    const b = await computeFingerprint(await qrScreenshot(`${PAYLOAD}-2`));
    expect(a).not.toBe(b);
  });

  it('falls back to an img: pixel hash that survives a lossless re-encode', async () => {
    const png = await patternImage(1).png().toBuffer();
    const webp = await patternImage(1).webp({ lossless: true }).toBuffer();
    const fpPng = await computeFingerprint(png);
    expect(fpPng).toMatch(/^img:[0-9a-f]{64}$/);
    expect(await computeFingerprint(webp)).toBe(fpPng);
    // Metadata is not part of the fingerprint.
    const withExif = await patternImage(1).png().withExif({ IFD0: { Artist: 'someone' } }).toBuffer();
    expect(await computeFingerprint(withExif)).toBe(fpPng);
  });

  it('gives different img: fingerprints for different pictures', async () => {
    const a = await computeFingerprint(await patternImage(1).png().toBuffer());
    const b = await computeFingerprint(await patternImage(2).png().toBuffer());
    expect(a).not.toBe(b);
  });

  it('is not the raw file hash (re-encoding alone does not dodge it)', async () => {
    const png = await patternImage(3).png({ compressionLevel: 0 }).toBuffer();
    const png9 = await patternImage(3).png({ compressionLevel: 9 }).toBuffer();
    expect(png.equals(png9)).toBe(false);
    expect(await computeFingerprint(png)).toBe(await computeFingerprint(png9));
  });

  it('rejects input that is not a JPEG/PNG/WebP image', async () => {
    await expect(computeFingerprint(Buffer.from('%PDF-1.7\n%%EOF\n'))).rejects.toBeInstanceOf(InvalidUploadError);
    await expect(computeFingerprint(randomBytes(64))).rejects.toBeInstanceOf(InvalidUploadError);
  });

  it('rejects a corrupt image', async () => {
    const png = await patternImage(1).png().toBuffer();
    await expect(computeFingerprint(png.subarray(0, 60))).rejects.toBeInstanceOf(InvalidUploadError);
  });

  it('handles images with an alpha channel', async () => {
    const rgba = await sharp({
      create: { width: 50, height: 40, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    expect(await computeFingerprint(rgba)).toMatch(/^img:[0-9a-f]{64}$/);
  });
});
