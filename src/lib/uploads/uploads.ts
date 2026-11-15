import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { isAdmin } from '@/lib/authz';
import type { Actor } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';
import { InvalidUploadError } from './errors';
import type { BlobStore } from './store';

// SEG-09: only JPEG/PNG/WebP/PDF, max 8 MB, detected by content, metadata stripped.
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;
// SEG-10: signed file URLs live 60 s.
export const FILE_URL_TTL_SECONDS = 60;

export const FILE_KINDS = ['identity', 'selfie', 'proof', 'ticket', 'evidence'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export type UploadType = 'jpeg' | 'png' | 'webp' | 'pdf';

export const MIME_TYPES: Record<UploadType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

// Declared (client-supplied) types accepted for each detected type.
const DECLARED: Record<UploadType, readonly string[]> = {
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Magic-byte detection; the file name and declared type are never trusted.
export function detectType(buf: Buffer): UploadType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

function sharpError(e: unknown): InvalidUploadError {
  const msg = e instanceof Error ? e.message : '';
  return new InvalidUploadError(/pixel limit/i.test(msg) ? 'too_many_pixels' : 'corrupt');
}

// Decodes and re-encodes the image: sharp drops EXIF/XMP/ICC metadata unless
// asked to keep it. limitInputPixels guards against decompression bombs.
async function reencodeImage(file: Buffer, type: Exclude<UploadType, 'pdf'>): Promise<Buffer> {
  const opts = { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE, failOn: 'warning' as const };
  const meta = await sharp(file, opts)
    .metadata()
    .catch((e: unknown) => {
      throw sharpError(e);
    });
  if (meta.format !== type || !meta.width || !meta.height) throw new InvalidUploadError('corrupt');
  if (meta.width > MAX_IMAGE_SIDE || meta.height > MAX_IMAGE_SIDE) {
    throw new InvalidUploadError('too_many_pixels');
  }
  try {
    // rotate() bakes the EXIF orientation into the pixels before the tag is dropped.
    const img = sharp(file, opts).rotate();
    if (type === 'jpeg') img.jpeg({ quality: 90 });
    else if (type === 'png') img.png();
    else img.webp({ quality: 90 });
    return await img.toBuffer();
  } catch (e) {
    throw sharpError(e);
  }
}

export async function validateUpload(
  file: Buffer,
  declaredType: string,
): Promise<{ type: UploadType; clean: Buffer }> {
  if (file.length === 0) throw new InvalidUploadError('empty');
  if (file.length > MAX_UPLOAD_BYTES) throw new InvalidUploadError('too_large');
  const type = detectType(file);
  if (!type) throw new InvalidUploadError('unsupported_type');
  const declared = declaredType.split(';')[0].trim().toLowerCase();
  if (!DECLARED[type].includes(declared)) throw new InvalidUploadError('type_mismatch');
  // PDFs are only magic-checked and size-limited; they are not sanitized.
  if (type === 'pdf') return { type, clean: Buffer.from(file) };
  return { type, clean: await reencodeImage(file, type) };
}

export function parseFilePath(path: string): { kind: FileKind; ownerId: string } | null {
  const parts = path.split('/');
  if (parts.length !== 3) return null;
  const [kind, ownerId, id] = parts;
  if (!(FILE_KINDS as readonly string[]).includes(kind)) return null;
  if (!UUID_RE.test(ownerId) || !UUID_RE.test(id)) return null;
  return { kind: kind as FileKind, ownerId };
}

// Stores already-validated bytes under an unguessable `<kind>/<ownerId>/<uuid>` path.
export async function storePrivate(
  store: BlobStore,
  clean: Buffer,
  kind: FileKind,
  ownerId: string,
): Promise<string> {
  if (!(FILE_KINDS as readonly string[]).includes(kind)) throw new Error('Invalid file kind');
  if (!UUID_RE.test(ownerId)) throw new Error('Invalid owner id');
  const path = `${kind}/${ownerId}/${randomUUID()}`;
  await store.put(path, clean);
  return path;
}

// Read policy: the file's owner, or an admin whose session passed 2FA.
export function canReadFile(path: string, actor: Actor): boolean {
  const parsed = parseFilePath(path);
  if (!parsed) return false;
  return parsed.ownerId === actor.userId || isAdmin(actor);
}

let testSecret: Buffer | undefined;

function fileUrlSecret(): Buffer {
  const s = process.env.FILE_URL_SECRET;
  if (s) {
    if (s.length < 32) throw new Error('FILE_URL_SECRET must be at least 32 characters');
    return Buffer.from(s, 'utf8');
  }
  // Tests get a random per-process key; every other environment must configure one.
  if (process.env.NODE_ENV === 'test') return (testSecret ??= randomBytes(32));
  throw new Error('FILE_URL_SECRET is not set: signed file URLs are unavailable');
}

function sign(payload: string): string {
  return createHmac('sha256', fileUrlSecret()).update(payload).digest('base64url');
}

// Short-lived URL bound to the requesting user. Never exposes the storage URL.
export function signedUrl(
  path: string,
  actor: Actor,
  opts: { now?: Date; ttlSeconds?: number } = {},
): string {
  if (!canReadFile(path, actor)) throw new ForbiddenError();
  const ttl = opts.ttlSeconds ?? FILE_URL_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('Invalid ttl');
  const now = opts.now ?? new Date();
  const payload = Buffer.from(
    JSON.stringify({ path, uid: actor.userId, exp: now.getTime() + ttl * 1000 }),
  ).toString('base64url');
  return `/api/files/${payload}.${sign(payload)}`;
}

const MAX_TOKEN_LENGTH = 1024;

// Returns the file path, or throws ForbiddenError on a bad signature, an
// expired token (now >= exp) or a token issued to another user.
export function verifyFileToken(token: string, actor: Actor, now: Date = new Date()): string {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) throw new ForbiddenError();
  const parts = token.split('.');
  if (parts.length !== 2) throw new ForbiddenError();
  const [payload, sig] = parts;
  // Compare the canonical encoding so alternative base64url spellings are rejected.
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ForbiddenError();
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new ForbiddenError();
  }
  const { path, uid, exp } = (data ?? {}) as { path?: unknown; uid?: unknown; exp?: unknown };
  if (typeof path !== 'string' || typeof uid !== 'string' || typeof exp !== 'number') {
    throw new ForbiddenError();
  }
  if (!Number.isFinite(exp) || now.getTime() >= exp) throw new ForbiddenError();
  if (uid !== actor.userId) throw new ForbiddenError();
  return path;
}
