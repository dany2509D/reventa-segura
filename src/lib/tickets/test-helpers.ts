// Test-only helpers: never import from production code (`qrcode` is a devDependency).
import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import QRCode from 'qrcode';
import sharp, { type Sharp } from 'sharp';
import * as schema from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';

/**
 * Returns a factory of fresh, fully migrated test databases. The migrations run once per
 * test file (via makeTestDb); every call hands out a clone of that template, which is
 * several times cheaper than starting and migrating a new PGlite instance.
 */
export function dbCloner(): () => Promise<Db> {
  let template: Promise<PGlite> | undefined;
  return async () => {
    template ??= makeTestDb().then((db) => (db as unknown as { $client: PGlite }).$client);
    const client = (await (await template).clone()) as PGlite;
    return drizzle(client, { schema });
  };
}

/** A plain QR code PNG for `payload`. */
export async function qrPng(
  payload: string,
  o: { scale?: number; margin?: number; dark?: string; light?: string } = {},
): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: 'png',
    errorCorrectionLevel: 'M',
    scale: o.scale ?? 4,
    margin: o.margin ?? 4,
    color: { dark: o.dark ?? '#000000ff', light: o.light ?? '#ffffffff' },
  });
}

type Format = 'jpeg' | 'png' | 'webp';

function encode(img: Sharp, format: Format): Promise<Buffer> {
  if (format === 'jpeg') return img.jpeg({ quality: 85 }).toBuffer();
  if (format === 'webp') return img.webp({ quality: 85 }).toBuffer();
  return img.png().toBuffer();
}

/**
 * A phone-style "screenshot" containing the QR for `payload`: different canvas size,
 * position, scale, surrounding content and encoding than a plain render.
 */
export async function qrScreenshot(
  payload: string,
  o: {
    width?: number;
    height?: number;
    qrSize?: number;
    left?: number;
    top?: number;
    format?: Format;
    background?: string;
    banner?: string;
    dark?: string;
    light?: string;
  } = {},
): Promise<Buffer> {
  const width = o.width ?? 720;
  const height = o.height ?? 1280;
  const qrSize = o.qrSize ?? 420;
  const qr = await sharp(await qrPng(payload, { scale: 10, dark: o.dark, light: o.light }))
    .resize(qrSize, qrSize, { kernel: 'nearest' })
    .png()
    .toBuffer();
  const banner = await sharp({
    create: { width, height: Math.round(height / 8), channels: 3, background: o.banner ?? '#1f3a93' },
  })
    .png()
    .toBuffer();
  const img = sharp({
    create: { width, height, channels: 3, background: o.background ?? '#f4f4f8' },
  }).composite([
    { input: banner, top: 0, left: 0 },
    { input: qr, top: o.top ?? Math.round((height - qrSize) / 2), left: o.left ?? Math.round((width - qrSize) / 2) },
  ]);
  return encode(img, o.format ?? 'jpeg');
}

/** Deterministic RGB noise (worst case for the QR locator), as a PNG. */
export function noisePng(side: number, seed = 1): Promise<Buffer> {
  const data = Buffer.alloc(side * side * 3);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; // LCG
    data[i] = s >>> 24;
  }
  return sharp(data, { raw: { width: side, height: side, channels: 3 } }).png().toBuffer();
}

/** A deterministic QR-less "photo" (smooth pattern); different seeds give different pictures. */
export function patternImage(seed: number, width = 320, height = 240): Sharp {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = (x * (seed + 1) + y) & 0xff;
      data[i + 1] = (y * (seed + 2) + x * 2) & 0xff;
      data[i + 2] = ((x ^ y) * (seed + 3)) & 0xff;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } });
}
