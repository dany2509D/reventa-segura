import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/db/types';
import { ForbiddenError } from '@/lib/errors';
import { InvalidUploadError } from './errors';
import { MemoryBlobStore, VercelBlobStore, getStore } from './store';
import {
  MAX_UPLOAD_BYTES,
  canReadFile,
  parseFilePath,
  signedUrl,
  storePrivate,
  validateUpload,
  verifyFileToken,
} from './uploads';

afterEach(() => {
  vi.unstubAllEnvs();
});

function image(format: 'jpeg' | 'png' | 'webp', width = 8, height = 6) {
  return sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    .toFormat(format)
    .toBuffer();
}

async function rejection(p: Promise<unknown>): Promise<InvalidUploadError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(InvalidUploadError);
  return err as InvalidUploadError;
}

describe('validateUpload: type detection by content', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('accepts a valid tiny %s and re-encodes it', async (format, mime) => {
    const input = await image(format);
    const out = await validateUpload(input, mime);
    expect(out.type).toBe(format);
    const meta = await sharp(out.clean).metadata();
    expect(meta.format).toBe(format);
    expect([meta.width, meta.height]).toEqual([8, 6]);
  });

  it('accepts image/jpg as an alias of image/jpeg and ignores mime parameters/case', async () => {
    const jpg = await image('jpeg');
    expect((await validateUpload(jpg, 'image/jpg')).type).toBe('jpeg');
    expect((await validateUpload(jpg, 'IMAGE/JPEG; charset=binary')).type).toBe('jpeg');
  });

  it('rejects a Windows executable (MZ header) renamed to .jpg', async () => {
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'), randomBytes(512)]);
    const err = await rejection(validateUpload(exe, 'image/jpeg'));
    expect(err.reason).toBe('unsupported_type');
  });

  it('rejects random bytes', async () => {
    const junk = Buffer.concat([Buffer.from([0x00, 0x01, 0x02, 0x03]), randomBytes(1024)]);
    expect((await rejection(validateUpload(junk, 'application/pdf'))).reason).toBe('unsupported_type');
  });

  it('rejects an empty file', async () => {
    expect((await rejection(validateUpload(Buffer.alloc(0), 'image/png'))).reason).toBe('empty');
  });

  it('rejects SVG and HTML even if declared as images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await rejection(validateUpload(svg, 'image/png'))).reason).toBe('unsupported_type');
    const html = Buffer.from('<!doctype html><script>alert(1)</script>');
    expect((await rejection(validateUpload(html, 'image/jpeg'))).reason).toBe('unsupported_type');
  });

  it('rejects a declared type that does not match the content', async () => {
    const png = await image('png');
    expect((await rejection(validateUpload(png, 'image/jpeg'))).reason).toBe('type_mismatch');
    expect((await rejection(validateUpload(png, 'application/pdf'))).reason).toBe('type_mismatch');
    expect((await rejection(validateUpload(png, ''))).reason).toBe('type_mismatch');
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    expect((await rejection(validateUpload(pdf, 'image/png'))).reason).toBe('type_mismatch');
  });
});

describe('validateUpload: size limit', () => {
  it('uses an 8 MB limit', () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
  });

  it('rejects a 9 MB file', async () => {
    const big = Buffer.alloc(9 * 1024 * 1024, 0x20);
    Buffer.from('%PDF-1.7\n').copy(big);
    expect((await rejection(validateUpload(big, 'application/pdf'))).reason).toBe('too_large');
  });

  it('accepts exactly 8 MB and rejects one byte more', async () => {
    const pdf = Buffer.alloc(MAX_UPLOAD_BYTES, 0x20);
    Buffer.from('%PDF-1.4\n').copy(pdf);
    await expect(validateUpload(pdf, 'application/pdf')).resolves.toMatchObject({ type: 'pdf' });
    const over = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x20);
    Buffer.from('%PDF-1.4\n').copy(over);
    expect((await rejection(validateUpload(over, 'application/pdf'))).reason).toBe('too_large');
  });
});

describe('validateUpload: metadata stripping and image bombs', () => {
  it('strips EXIF from a PNG', async () => {
    const withExif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#0f0' } })
      .png()
      .withExif({ IFD0: { Copyright: 'SECRET-OWNER-NAME', Artist: 'SECRET-ARTIST' } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    expect(withExif.includes('SECRET-OWNER-NAME')).toBe(true);

    const { clean, type } = await validateUpload(withExif, 'image/png');
    expect(type).toBe('png');
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect(clean.includes('SECRET-OWNER-NAME')).toBe(false);
    expect(clean.includes('SECRET-ARTIST')).toBe(false);
  });

  it('strips EXIF (including GPS-like data) from a JPEG', async () => {
    const withExif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'SECRET-OWNER-NAME' }, IFD3: { GPSLatitudeRef: 'N' } })
      .toBuffer();
    const { clean } = await validateUpload(withExif, 'image/jpeg');
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect(clean.includes('SECRET-OWNER-NAME')).toBe(false);
  });

  it('rejects images wider or taller than 8000 px', async () => {
    const wide = await image('png', 8001, 2);
    expect((await rejection(validateUpload(wide, 'image/png'))).reason).toBe('too_many_pixels');
    const tall = await image('png', 2, 8001);
    expect((await rejection(validateUpload(tall, 'image/png'))).reason).toBe('too_many_pixels');
  });

  it('rejects an image whose header claims huge dimensions (pixel bomb)', async () => {
    // Patch the IHDR of a tiny PNG to claim 100000 x 100000 pixels.
    const png = await image('png', 1, 1);
    const bomb = Buffer.from(png);
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);
    const err = await rejection(validateUpload(bomb, 'image/png'));
    expect(['too_many_pixels', 'corrupt']).toContain(err.reason);
  });

  it('rejects an image that fails to decode', async () => {
    const png = await image('png');
    const corrupt = Buffer.concat([png.subarray(0, 8), randomBytes(64)]);
    expect((await rejection(validateUpload(corrupt, 'image/png'))).reason).toBe('corrupt');
    const truncated = png.subarray(0, png.length - 20);
    expect((await rejection(validateUpload(truncated, 'image/png'))).reason).toBe('corrupt');
  });
});

describe('validateUpload: PDF', () => {
  it('accepts the %PDF- magic and returns the bytes unchanged', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
    const out = await validateUpload(pdf, 'application/pdf');
    expect(out.type).toBe('pdf');
    expect(out.clean.equals(pdf)).toBe(true);
  });

  it('rejects a PDF-looking file without the full magic', async () => {
    const fake = Buffer.from('%PD-1.7\n');
    expect((await rejection(validateUpload(fake, 'application/pdf'))).reason).toBe('unsupported_type');
  });
});

describe('storePrivate', () => {
  const owner = randomUUID();

  it('stores under an unguessable <kind>/<ownerId>/<uuid> path', async () => {
    const store = new MemoryBlobStore();
    const data = Buffer.from('hello');
    const a = await storePrivate(store, data, 'identity', owner);
    const b = await storePrivate(store, data, 'identity', owner);
    expect(a).toMatch(new RegExp(`^identity/${owner}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`));
    expect(a).not.toBe(b);
    expect((await store.get(a))?.equals(data)).toBe(true);
  });

  it.each(['selfie', 'proof', 'ticket', 'evidence'] as const)('supports kind %s', async (kind) => {
    const path = await storePrivate(new MemoryBlobStore(), Buffer.from('x'), kind, owner);
    expect(parseFilePath(path)).toEqual({ kind, ownerId: owner });
  });

  it('refuses an invalid owner id or kind', async () => {
    const store = new MemoryBlobStore();
    await expect(storePrivate(store, Buffer.from('x'), 'identity', '../etc')).rejects.toThrow();
    await expect(storePrivate(store, Buffer.from('x'), 'identity', `${owner}/x`)).rejects.toThrow();
    await expect(
      storePrivate(store, Buffer.from('x'), 'avatar' as unknown as 'identity', owner),
    ).rejects.toThrow();
  });
});

describe('parseFilePath', () => {
  it('rejects malformed paths', () => {
    const id = randomUUID();
    expect(parseFilePath(`identity/${id}/${id}`)).toEqual({ kind: 'identity', ownerId: id });
    expect(parseFilePath(`identity/${id}/${id}/x`)).toBeNull();
    expect(parseFilePath(`../identity/${id}/${id}`)).toBeNull();
    expect(parseFilePath(`avatar/${id}/${id}`)).toBeNull();
    expect(parseFilePath(`identity/not-a-uuid/${id}`)).toBeNull();
  });
});

describe('MemoryBlobStore', () => {
  it('puts, gets, refuses overwrite and deletes', async () => {
    const s = new MemoryBlobStore();
    await s.put('a/b', Buffer.from('1'));
    await expect(s.put('a/b', Buffer.from('2'))).rejects.toThrow();
    expect((await s.get('a/b'))?.toString()).toBe('1');
    await s.del('a/b');
    expect(await s.get('a/b')).toBeNull();
  });

  it('returns copies so callers cannot mutate stored bytes', async () => {
    const s = new MemoryBlobStore();
    const data = Buffer.from('abc');
    await s.put('k', data);
    data[0] = 0x7a;
    const got = (await s.get('k'))!;
    got[1] = 0x7a;
    expect((await s.get('k'))!.toString()).toBe('abc');
  });
});

describe('getStore', () => {
  it('throws in production without Blob configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect(() => getStore()).toThrow(/Blob storage not configured/);
  });

  it('returns a shared in-memory store outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const s = getStore();
    expect(s).toBeInstanceOf(MemoryBlobStore);
    expect(getStore()).toBe(s);
  });

  it('returns a Vercel Blob store when a token is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test_token');
    expect(getStore()).toBeInstanceOf(VercelBlobStore);
  });
});

describe('signedUrl / verifyFileToken', () => {
  const ownerId = randomUUID();
  const owner: Actor = { userId: ownerId, role: 'user', mfa: false };
  const other: Actor = { userId: randomUUID(), role: 'user', mfa: false };
  const admin: Actor = { userId: randomUUID(), role: 'admin', mfa: true };
  const path = `identity/${ownerId}/${randomUUID()}`;
  const now = new Date('2026-11-15T12:00:00Z');
  const tokenOf = (url: string) => url.replace(/^\/api\/files\//, '');

  it('produces /api/files/<token> that verifies for the owner', () => {
    const url = signedUrl(path, owner, { now });
    expect(url).toMatch(/^\/api\/files\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyFileToken(tokenOf(url), owner, now)).toBe(path);
  });

  it('is rejected when presented by another user', () => {
    const token = tokenOf(signedUrl(path, owner, { now }));
    expect(() => verifyFileToken(token, other, now)).toThrow(ForbiddenError);
    expect(() => verifyFileToken(token, admin, now)).toThrow(ForbiddenError);
  });

  it('refuses to sign a file for a user who is neither the owner nor an admin with 2FA', () => {
    expect(() => signedUrl(path, other, { now })).toThrow(ForbiddenError);
    expect(() => signedUrl(path, { ...admin, mfa: false }, { now })).toThrow(ForbiddenError);
    expect(() => signedUrl(path, { ...other, mfa: true }, { now })).toThrow(ForbiddenError);
  });

  it('signs for an admin with 2FA, bound to that admin', () => {
    const token = tokenOf(signedUrl(path, admin, { now }));
    expect(verifyFileToken(token, admin, now)).toBe(path);
    expect(() => verifyFileToken(token, owner, now)).toThrow(ForbiddenError);
  });

  it('expires after 60 seconds by default', () => {
    const token = tokenOf(signedUrl(path, owner, { now }));
    expect(verifyFileToken(token, owner, new Date(now.getTime() + 59_999))).toBe(path);
    expect(() => verifyFileToken(token, owner, new Date(now.getTime() + 60_000))).toThrow(ForbiddenError);
    expect(() => verifyFileToken(token, owner, new Date(now.getTime() + 3_600_000))).toThrow(ForbiddenError);
  });

  it('honours a custom ttl', () => {
    const token = tokenOf(signedUrl(path, owner, { now, ttlSeconds: 5 }));
    expect(verifyFileToken(token, owner, new Date(now.getTime() + 4_999))).toBe(path);
    expect(() => verifyFileToken(token, owner, new Date(now.getTime() + 5_000))).toThrow(ForbiddenError);
  });

  it('rejects a tampered payload or signature', () => {
    const token = tokenOf(signedUrl(path, owner, { now }));
    const [payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

    const longer = Buffer.from(JSON.stringify({ ...decoded, exp: decoded.exp + 86_400_000 })).toString('base64url');
    expect(() => verifyFileToken(`${longer}.${sig}`, owner, now)).toThrow(ForbiddenError);

    const otherPath = `identity/${randomUUID()}/${randomUUID()}`;
    const swapped = Buffer.from(JSON.stringify({ ...decoded, path: otherPath })).toString('base64url');
    expect(() => verifyFileToken(`${swapped}.${sig}`, owner, now)).toThrow(ForbiddenError);

    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(() => verifyFileToken(`${payload}.${flipped}`, owner, now)).toThrow(ForbiddenError);
    expect(() => verifyFileToken(`${payload}.${sig.slice(0, -2)}`, owner, now)).toThrow(ForbiddenError);
    expect(() => verifyFileToken(payload, owner, now)).toThrow(ForbiddenError);
    expect(() => verifyFileToken('', owner, now)).toThrow(ForbiddenError);
    expect(() => verifyFileToken(`${payload}.${sig}.x`, owner, now)).toThrow(ForbiddenError);
  });

  it('rejects a token signed with a different secret', () => {
    vi.stubEnv('FILE_URL_SECRET', 'a'.repeat(32));
    const token = tokenOf(signedUrl(path, owner, { now }));
    vi.stubEnv('FILE_URL_SECRET', 'b'.repeat(32));
    expect(() => verifyFileToken(token, owner, now)).toThrow(ForbiddenError);
  });

  it('throws a clear error when FILE_URL_SECRET is missing or weak outside tests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FILE_URL_SECRET', '');
    expect(() => signedUrl(path, owner, { now })).toThrow(/FILE_URL_SECRET/);
    vi.stubEnv('FILE_URL_SECRET', 'short');
    expect(() => signedUrl(path, owner, { now })).toThrow(/FILE_URL_SECRET/);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FILE_URL_SECRET', '');
    expect(() => signedUrl(path, owner, { now })).toThrow(/FILE_URL_SECRET/);
  });
});

describe('canReadFile', () => {
  const ownerId = randomUUID();
  const path = `selfie/${ownerId}/${randomUUID()}`;
  it('allows the owner and an admin with 2FA only', () => {
    expect(canReadFile(path, { userId: ownerId, role: 'user', mfa: false })).toBe(true);
    expect(canReadFile(path, { userId: randomUUID(), role: 'admin', mfa: true })).toBe(true);
    expect(canReadFile(path, { userId: randomUUID(), role: 'admin', mfa: false })).toBe(false);
    expect(canReadFile(path, { userId: randomUUID(), role: 'user', mfa: true })).toBe(false);
    expect(canReadFile('garbage', { userId: ownerId, role: 'user', mfa: false })).toBe(false);
  });
});
