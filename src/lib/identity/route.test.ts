import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { createSession } from '@/lib/auth/session';
import { MemoryBlobStore, getStore } from '@/lib/uploads/store';
import { parseFilePath } from '@/lib/uploads/uploads';

let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

import { POST } from '@/app/api/identity/route';

const URL_I = 'http://localhost/api/identity';
let userId: string;
let cookie: string;
let docPng: Buffer;
let selfieJpg: Buffer;

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

function upload(
  fields: Record<string, Blob | string>,
  headers: Record<string, string> = {},
): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  return new Request(URL_I, {
    method: 'POST',
    body: fd,
    headers: { host: 'localhost', origin: 'http://localhost', cookie, ...headers },
  });
}

async function userRow() {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row;
}

beforeEach(async () => {
  db = await makeTestDb();
  const [u] = await db.insert(users).values({ phone: '+50760000021' }).returning({ id: users.id });
  userId = u.id;
  cookie = `session=${await createSession(db, userId, 'user')}`;
  docPng = await sharp({ create: { width: 6, height: 4, channels: 3, background: '#eeeeee' } })
    .png()
    .withExif({ IFD0: { Copyright: 'SECRET-CEDULA-OWNER' } })
    .toBuffer();
  selfieJpg = await sharp({ create: { width: 4, height: 6, channels: 3, background: '#aa8866' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'SECRET-SELFIE-OWNER' } })
    .toBuffer();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/identity', () => {
  it('stores both files privately, strips metadata and sets the status to pending', async () => {
    const res = await POST(
      upload({ doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(200);
    const row = await userRow();
    expect(row.identityStatus).toBe('pending');
    expect(parseFilePath(row.idDocPath!)).toEqual({ kind: 'identity', ownerId: userId });
    expect(parseFilePath(row.selfiePath!)).toEqual({ kind: 'selfie', ownerId: userId });

    const doc = (await getStore().get(row.idDocPath!))!;
    const selfie = (await getStore().get(row.selfiePath!))!;
    expect((await sharp(doc).metadata()).exif).toBeUndefined();
    expect(doc.includes('SECRET-CEDULA-OWNER')).toBe(false);
    expect(selfie.includes('SECRET-SELFIE-OWNER')).toBe(false);

    const body = await res.text();
    expect(body).not.toContain(row.idDocPath!);
    expect(body).not.toContain(row.selfiePath!);
  });

  it('accepts a PDF document', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const res = await POST(
      upload({ doc: blob(pdf, 'application/pdf'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 without a session', async () => {
    cookie = '';
    const res = await POST(
      upload({ doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 415 for a non-multipart body', async () => {
    const req = new Request(URL_I, {
      method: 'POST',
      body: JSON.stringify({ doc: 'x' }),
      headers: { 'content-type': 'application/json', host: 'localhost', origin: 'http://localhost', cookie },
    });
    expect((await POST(req)).status).toBe(415);
  });

  it('returns 403 for a foreign or missing Origin', async () => {
    const fields = { doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') };
    expect((await POST(upload(fields, { origin: 'https://evil.example' }))).status).toBe(403);
    const noOrigin = upload(fields);
    noOrigin.headers.delete('origin');
    expect((await POST(noOrigin)).status).toBe(403);
    expect((await userRow()).identityStatus).toBe('none');
  });

  it('returns 400 when a file is missing', async () => {
    expect((await POST(upload({ doc: blob(docPng, 'image/png') }))).status).toBe(400);
    expect(
      (await POST(upload({ doc: blob(docPng, 'image/png'), selfie: 'not a file' }))).status,
    ).toBe(400);
  });

  it('returns 400 for an executable disguised as a JPEG', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), randomBytes(256)]);
    const res = await POST(upload({ doc: blob(exe, 'image/jpeg'), selfie: blob(selfieJpg, 'image/jpeg') }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/formato/i);
    expect((await userRow()).identityStatus).toBe('none');
  });

  it('returns 400 when the selfie is a PDF', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const res = await POST(upload({ doc: blob(docPng, 'image/png'), selfie: blob(pdf, 'application/pdf') }));
    expect(res.status).toBe(400);
    expect((await userRow()).identityStatus).toBe('none');
  });

  const multipartHeaders = () => ({
    'content-type': 'multipart/form-data; boundary=xyz',
    host: 'localhost',
    origin: 'http://localhost',
    cookie,
  });

  it('returns 413 when Content-Length exceeds the limit', async () => {
    // The declared length alone is enough to refuse, before reading the body.
    const req = new Request(URL_I, {
      method: 'POST',
      body: new Uint8Array(16),
      headers: { ...multipartHeaders(), 'content-length': String(17 * 1024 * 1024) },
    });
    expect(req.headers.get('content-length')).toBe(String(17 * 1024 * 1024));
    expect((await POST(req)).status).toBe(413);
  });

  it('returns 413 when a streamed body without Content-Length exceeds the limit', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 40) return controller.close();
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request(URL_I, {
      method: 'POST',
      body,
      headers: multipartHeaders(),
      duplex: 'half',
    } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await POST(req)).status).toBe(413);
    expect(sent).toBeLessThan(40);
  });

  it('returns 409 when the identity is already pending, without storing anything', async () => {
    await db.update(users).set({ identityStatus: 'pending' }).where(eq(users.id, userId));
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    const res = await POST(
      upload({ doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it('allows resubmission after a rejection', async () => {
    await db.update(users).set({ identityStatus: 'rejected' }).where(eq(users.id, userId));
    const res = await POST(
      upload({ doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(200);
    expect((await userRow()).identityStatus).toBe('pending');
  });

  it('deletes stored blobs when the status update fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const del = vi.spyOn(MemoryBlobStore.prototype, 'del');
    const realTx = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((() => {
      throw new Error('db down');
    }) as unknown as typeof realTx);
    const res = await POST(
      upload({ doc: blob(docPng, 'image/png'), selfie: blob(selfieJpg, 'image/jpeg') }),
    );
    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('6000');
  });
});
