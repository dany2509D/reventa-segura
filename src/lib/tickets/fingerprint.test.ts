import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { computeFingerprint, extractQrPayload, qrScannerTestHooks as hooks } from './fingerprint';
import { noisePng, patternImage, qrPng, qrScreenshot } from './test-helpers';

// Guard: jsQR must never run on the main thread. The scanner worker is a plain Node module
// outside Vitest's module graph, so this mock cannot reach it; every decode test below
// passing therefore proves the decoding happens in the worker.
vi.mock('jsqr', () => ({
  default: () => {
    throw new Error('jsQR called on the main thread');
  },
}));

// Image decoding and QR scanning are CPU-bound: leave headroom for a loaded machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const PAYLOAD = 'TKT-2026-ATLAPA-SEC-B-FILA-12-ASIENTO-7-9f2c1e';

afterEach(() => {
  hooks.setBudgetMs();
  hooks.setWorkerUrl();
});

describe('QR scanner isolation (worker thread, budget, concurrency)', () => {
  let noise1600: Buffer;
  let noise600: Buffer;

  beforeAll(async () => {
    noise1600 = await noisePng(1600, 7);
    noise600 = await noisePng(600, 9);
  });

  it('returns quickly for a 1600x1600 noise image and falls back to an img: fingerprint', async () => {
    const start = Date.now();
    expect(await extractQrPayload(noise1600)).toBeNull();
    expect(Date.now() - start).toBeLessThan(8000);
    const t2 = Date.now();
    expect(await computeFingerprint(noise1600)).toMatch(/^img:[0-9a-f]{64}$/);
    expect(Date.now() - t2).toBeLessThan(8000);
    expect(hooks.stats().liveWorkers).toBe(0);
  });

  it('keeps the event loop responsive while a noise image is scanned', async () => {
    let last = performance.now();
    let maxGap = 0;
    let ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      ticks++;
    }, 10);
    const start = performance.now();
    try {
      await extractQrPayload(noise1600);
    } finally {
      clearInterval(timer);
    }
    const elapsed = performance.now() - start;
    expect(ticks).toBeGreaterThan(5);
    // A synchronous jsQR pass would stall the loop for most of the scan.
    expect(maxGap).toBeLessThan(Math.max(250, elapsed / 2));
  });

  it('terminates the worker when the budget runs out and reports no QR', async () => {
    hooks.setBudgetMs(30);
    const before = hooks.stats();
    expect(await extractQrPayload(noise600)).toBeNull();
    const after = hooks.stats();
    expect(after.timeouts).toBe(before.timeouts + 1);
    expect(after.spawned).toBe(before.spawned + 1);
    expect(after.liveWorkers).toBe(0);
    // A timeout is not an upload error: the fingerprint falls back to img:.
    expect(await computeFingerprint(noise600)).toMatch(/^img:/);
    expect(hooks.stats().liveWorkers).toBe(0);
  });

  it('runs at most 2 scans at once and serves waiting callers in FIFO order', async () => {
    hooks.setBudgetMs(150);
    hooks.resetPeak();
    const done: number[] = [];
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        extractQrPayload(noise600).then((r) => {
          done.push(i);
          return r;
        }),
      ),
    );
    expect(results).toEqual([null, null, null, null, null]);
    const s = hooks.stats();
    expect(s.peakActive).toBe(2);
    expect(s.active).toBe(0);
    expect(s.queued).toBe(0);
    expect(s.liveWorkers).toBe(0);
    // Rounds: {0,1} then {2,3} then {4}; LIFO would finish 2 last instead.
    expect(done[4]).toBe(4);
  });

  describe('fails closed (throws) when the worker cannot do its job', () => {
    // 64 MP: decoding takes far longer than a broken worker needs to fail, so the failure
    // happens before the scan starts listening to the worker.
    let slowDecode: Buffer;
    beforeAll(async () => {
      slowDecode = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#808080' } })
        .png()
        .toBuffer();
    });

    it('when the worker file cannot be loaded', async () => {
      hooks.setWorkerUrl(new URL('./does-not-exist-qr-worker.mjs', import.meta.url));
      await expect(extractQrPayload(await qrPng(PAYLOAD))).rejects.toThrow(/QR scanner/);
      await expect(extractQrPayload(slowDecode)).rejects.toThrow(/QR scanner/);
      await expect(computeFingerprint(slowDecode)).rejects.toThrow(/QR scanner/);
      const s = hooks.stats();
      expect(s.liveWorkers).toBe(0);
      expect(s.active).toBe(0);
    });

    it('when the worker exits without answering', async () => {
      hooks.setWorkerUrl(new URL('data:text/javascript,process.exit(0)'));
      await expect(extractQrPayload(await qrPng(PAYLOAD))).rejects.toThrow(/QR scanner/);
      await expect(extractQrPayload(slowDecode)).rejects.toThrow(/QR scanner/);
      expect(hooks.stats().liveWorkers).toBe(0);
    });
  });
});

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

  const faint = { format: 'png', dark: '#7a7a7aff', light: '#8a8a8aff', background: '#8a8a8a', banner: '#8a8a8a' } as const;

  it('reads a faint QR in a small image with the contrast-stretched second pass', async () => {
    // 16 grey levels apart: below jsQR's own minimum dynamic range. Side <= 600 px.
    const img = await qrScreenshot(PAYLOAD, { ...faint, width: 480, height: 600, qrSize: 320 });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('reads a faint QR in a large image (contrast-stretched first pass)', async () => {
    const img = await qrScreenshot(PAYLOAD, { ...faint, width: 720, height: 1280 });
    expect(await extractQrPayload(img)).toBe(PAYLOAD);
  });

  it('skips the inverted second pass for images larger than 600 px after downscaling', async () => {
    // Bounded cost by design: an inverted QR in a large picture is not decoded.
    const inverted = { dark: '#ffffffff', light: '#000000ff', background: '#000000', banner: '#000000' };
    const small = await qrScreenshot(PAYLOAD, { ...inverted, width: 480, height: 600, qrSize: 320, format: 'png' });
    expect(await extractQrPayload(small)).toBe(PAYLOAD);
    const large = await qrScreenshot(PAYLOAD, { ...inverted, width: 720, height: 1280, format: 'png' });
    expect(await extractQrPayload(large)).toBeNull();
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
