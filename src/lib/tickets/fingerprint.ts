import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
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
 *
 * QR scanning cost is bounded (jsQR is synchronous and can take tens of seconds on noisy
 * images): decoding runs in a worker thread (qr-worker.mjs), images are downscaled to
 * QR_SCAN_MAX_SIDE, each scan has one overall QR_SCAN_BUDGET_MS budget after which the worker
 * is terminated and the image counts as "no QR", and at most MAX_CONCURRENT_QR_SCANS scans
 * run at once (further callers wait, FIFO). If the worker cannot run at all, scanning throws
 * instead of silently degrading every ticket to an img: fingerprint.
 */

export const QR_SCAN_MAX_SIDE = 800;
/** The inverted / contrast-stretched second pass only runs on images this small or smaller. */
export const QR_SECOND_PASS_MAX_SIDE = 600;
export const QR_SCAN_BUDGET_MS = 3000;
export const MAX_CONCURRENT_QR_SCANS = 2;
const HEURISTIC_SIDE = 256;
const SHARP_OPTS = { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE };

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export const qrFingerprint = (payload: string) => `qr:${sha256(payload)}`;

function isImage(buf: Buffer): boolean {
  const type = detectType(buf);
  return type === 'jpeg' || type === 'png' || type === 'webp';
}

// --- scanner state -----------------------------------------------------------------------

const config: { budgetMs: number; createWorker?: () => Worker } = { budgetMs: QR_SCAN_BUDGET_MS };
const stats = { active: 0, peakActive: 0, queued: 0, liveWorkers: 0, spawned: 0, timeouts: 0 };
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (stats.active < MAX_CONCURRENT_QR_SCANS) {
    stats.active++;
    stats.peakActive = Math.max(stats.peakActive, stats.active);
    return;
  }
  stats.queued++;
  await new Promise<void>((resolve) => waiting.push(resolve));
  stats.queued--; // the releasing scan handed its slot over: `active` is unchanged
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else stats.active--;
}

class ScanTimeoutError extends Error {}

/** The QR worker could not run: scanning fails closed rather than degrading to img:. */
export class QrScannerUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('QR scanner unavailable', { cause });
    this.name = 'QrScannerUnavailableError';
  }
}

function newWorker(): Worker {
  if (config.createWorker) return config.createWorker();
  // Keep this call literal: bundlers only recognise `new Worker(new URL('<literal>',
  // import.meta.url))` and emit the worker file; a computed argument makes Turbopack treat
  // every file in the project as a possible worker entry.
  return new Worker(new URL('./qr-worker.mjs', import.meta.url));
}

// A worker plus whatever went wrong with it so far. The worker may fail or exit while sharp
// is still decoding, before a scan listens for events: that state is kept here.
type ScanWorker = { worker: Worker; failure?: QrScannerUnavailableError };

function spawnWorker(): ScanWorker {
  let worker: Worker;
  try {
    worker = newWorker();
  } catch (e) {
    throw new QrScannerUnavailableError(e);
  }
  const handle: ScanWorker = { worker };
  stats.spawned++;
  stats.liveWorkers++;
  worker.once('exit', () => {
    stats.liveWorkers--;
    handle.failure ??= new QrScannerUnavailableError();
  });
  // Always listening, so a failure is recorded and never unhandled.
  worker.on('error', (e) => {
    handle.failure ??= new QrScannerUnavailableError(e);
  });
  return handle;
}

type Pixels = { data: Uint8Array<ArrayBuffer>; channels: number; width: number; height: number };

async function rawPixels(img: Sharp): Promise<Pixels> {
  const { data, info } = await img.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  // A private copy whose buffer can be transferred to the worker.
  return { data: new Uint8Array(data), channels: info.channels, width: info.width, height: info.height };
}

function scanInWorker(
  handle: ScanWorker,
  pixels: Pixels,
  inversionAttempts: 'dontInvert' | 'attemptBoth',
  deadline: number,
): Promise<string | null> {
  const { worker } = handle;
  return new Promise((resolve, reject) => {
    if (handle.failure) return reject(handle.failure);
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new ScanTimeoutError());
    const done = () => {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    const onMessage = (m: { payload: string | null }) => {
      done();
      resolve(m.payload);
    };
    const onError = (e: unknown) => {
      done();
      reject(new QrScannerUnavailableError(e));
    };
    const onExit = () => {
      done();
      reject(new QrScannerUnavailableError());
    };
    const timer = setTimeout(() => {
      done();
      reject(new ScanTimeoutError());
    }, remaining);
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage({ ...pixels, inversionAttempts }, [pixels.data.buffer]);
  });
}

type QrScan = { payload: string | null; timedOut: boolean };

async function scanQr(image: Buffer): Promise<QrScan> {
  if (!isImage(image)) return { payload: null, timedOut: false };
  await acquireSlot();
  // The budget starts once a slot is held, so time spent queued behind other uploads can
  // never turn a readable QR into a "no QR" result.
  const deadline = Date.now() + config.budgetMs;
  let worker: ScanWorker | undefined;
  try {
    worker = spawnWorker(); // boots while sharp decodes
    const base = () =>
      sharp(image, SHARP_OPTS)
        .rotate()
        // A QR on a transparent background is dark-on-white once flattened.
        .flatten({ background: '#ffffff' })
        .resize({ width: QR_SCAN_MAX_SIDE, height: QR_SCAN_MAX_SIDE, fit: 'inside', withoutEnlargement: true });

    let first: Pixels;
    try {
      // Contrast-stretched: jsQR's binarizer misses low-contrast codes at some scales.
      first = await rawPixels(base().normalise());
    } catch {
      return { payload: null, timedOut: false }; // undecodable image
    }
    const side = Math.max(first.width, first.height);
    const found = await scanInWorker(worker, first, 'dontInvert', deadline);
    if (found?.trim()) return { payload: found.trim(), timedOut: false };
    if (side > QR_SECOND_PASS_MAX_SIDE) return { payload: null, timedOut: false };

    // Small images only: inverted codes, and faint ones via a grayscale stretch.
    const second = await rawPixels(base().grayscale().normalise());
    const again = await scanInWorker(worker, second, 'attemptBoth', deadline);
    return { payload: again?.trim() || null, timedOut: false };
  } catch (e) {
    if (e instanceof ScanTimeoutError) {
      stats.timeouts++;
      return { payload: null, timedOut: true };
    }
    if (e instanceof QrScannerUnavailableError) throw e;
    return { payload: null, timedOut: false };
  } finally {
    if (worker) await worker.worker.terminate();
    releaseSlot();
  }
}

/** The QR payload in a JPEG/PNG/WebP image, or null when there is none, it is not an image,
 * or the scan ran out of its time budget. Throws QrScannerUnavailableError if the scanner
 * worker cannot run. */
export async function extractQrPayload(image: Buffer): Promise<string | null> {
  return (await scanQr(image)).payload;
}

export type TicketFingerprint = {
  fingerprint: string;
  /** The decoded QR payload when the fingerprint is `qr:`. */
  qrPayload: string | null;
  /** True when an `img:` fallback happened because the QR scan ran out of time. */
  qrScanTimedOut: boolean;
};

/** Fingerprint plus how it was obtained (used by createListing). */
export async function fingerprintTicket(file: Buffer): Promise<TicketFingerprint> {
  if (!isImage(file)) throw new InvalidUploadError('unsupported_type');
  const scan = await scanQr(file);
  if (scan.payload) return { fingerprint: qrFingerprint(scan.payload), qrPayload: scan.payload, qrScanTimedOut: false };
  try {
    const pixels = await sharp(file, { ...SHARP_OPTS, failOn: 'warning' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .grayscale()
      .resize(HEURISTIC_SIDE, HEURISTIC_SIDE, { fit: 'fill' })
      .raw({ depth: 'uchar' })
      .toBuffer();
    return { fingerprint: `img:${sha256(pixels)}`, qrPayload: null, qrScanTimedOut: scan.timedOut };
  } catch {
    throw new InvalidUploadError('corrupt');
  }
}

/** `qr:<hex>` when a QR is readable, else `img:<hex>` (see the module comment). */
export async function computeFingerprint(file: Buffer): Promise<string> {
  return (await fingerprintTicket(file)).fingerprint;
}

/** Test-only knobs and counters; application code never calls these. */
export const qrScannerTestHooks = {
  stats: () => ({ ...stats }),
  resetPeak: () => {
    stats.peakActive = stats.active;
  },
  /** Overrides the scan budget; no argument restores QR_SCAN_BUDGET_MS. */
  setBudgetMs: (ms?: number) => {
    config.budgetMs = ms ?? QR_SCAN_BUDGET_MS;
  },
  /** Overrides how scan workers are created; no argument restores qr-worker.mjs. */
  setWorkerFactory: (create?: () => Worker) => {
    config.createWorker = create;
  },
};
