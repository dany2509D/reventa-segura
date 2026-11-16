import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@/lib/auth/session';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { HOUR, auditOf, getOrder, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { MemoryBlobStore, getStore } from '@/lib/uploads/store';
import { parseFilePath } from '@/lib/uploads/uploads';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

const { POST } = await import('./route');

let fx: Awaited<ReturnType<typeof seedPaidOrder>>;
let cookie: string;
let jpg: Buffer;

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

function post(
  fields: Record<string, Blob | string>,
  o: { id?: string; headers?: Record<string, string> } = {},
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  const id = o.id ?? fx.order.id;
  const req = new Request(`http://localhost/api/orders/${id}/entry`, {
    method: 'POST',
    body: fd,
    headers: { host: 'localhost', origin: 'http://localhost', cookie, ...o.headers },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

const seed = (o: { deliveryMode?: 'file' | 'transfer'; startsAt?: Date } = {}) => {
  const startsAt = o.startsAt ?? new Date(Date.now() + HOUR);
  return seedPaidOrder(h.db, new FakeGateway('entry-route'), {
    deliveryMode: o.deliveryMode ?? 'file',
    startsAt,
    paidAt: new Date(startsAt.getTime() - 24 * HOUR),
  });
};

beforeEach(async () => {
  h.db = await makeTestDb();
  fx = await seed();
  cookie = `session=${await createSession(h.db, fx.buyer.id, 'user')}`;
  jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#336699' } }).jpeg().toBuffer();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/orders/[id]/entry', () => {
  it('stores the scan photo privately and confirms entry (geo is only a signal)', async () => {
    const res = await post({ lat: '9.001', lng: '-79.5', photo: blob(jpg, 'image/jpeg') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, geoOk: true });
    expect((await getOrder(h.db, fx.order.id)).state).toBe('ingreso_confirmado');

    const [a] = (await auditOf(h.db, fx.order.id)).filter((x) => x.action === 'order.entry_confirmed');
    const photoPath = (a.detail as { photoPath: string }).photoPath;
    expect(parseFilePath(photoPath)).toEqual({ kind: 'proof', ownerId: fx.buyer.id });
    expect(await getStore().get(photoPath)).not.toBeNull();
  });

  it('missing or far-away coordinates still confirm, with geoOk false', async () => {
    const res = await post({ photo: blob(jpg, 'image/jpeg') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, geoOk: false });
  });

  it('401 without a session, 415 for non-multipart, 403 for a foreign or missing Origin', async () => {
    cookie = '';
    expect((await post({ photo: blob(jpg, 'image/jpeg') })).status).toBe(401);
    cookie = `session=${await createSession(h.db, fx.buyer.id, 'user')}`;

    const json = new Request(`http://localhost/api/orders/${fx.order.id}/entry`, {
      method: 'POST',
      body: JSON.stringify({ lat: 9, lng: -79.5 }),
      headers: { 'content-type': 'application/json', host: 'localhost', origin: 'http://localhost', cookie },
    });
    expect((await POST(json, { params: Promise.resolve({ id: fx.order.id }) })).status).toBe(415);
    expect((await post({ photo: blob(jpg, 'image/jpeg') }, { headers: { origin: 'https://evil.example' } })).status).toBe(
      403,
    );
    expect((await getOrder(h.db, fx.order.id)).state).toBe('entrada_recibida');
  });

  it('403 for someone who is not the buyer, without storing anything', async () => {
    cookie = `session=${await createSession(h.db, fx.seller.id, 'user')}`;
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    expect((await post({ photo: blob(jpg, 'image/jpeg') })).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it('404 for an unknown or malformed order id', async () => {
    expect((await post({ photo: blob(jpg, 'image/jpeg') }, { id: '00000000-0000-4000-8000-000000000000' })).status).toBe(
      404,
    );
    expect((await post({ photo: blob(jpg, 'image/jpeg') }, { id: 'nope' })).status).toBe(404);
  });

  it('400 without a photo or with a PDF / non-image file', async () => {
    expect((await post({ lat: '9', lng: '-79.5' })).status).toBe(400);
    expect((await post({ photo: blob(Buffer.from('%PDF-1.7\n%%EOF\n'), 'application/pdf') })).status).toBe(400);
    expect((await post({ photo: blob(Buffer.from('MZ not an image'), 'image/jpeg') })).status).toBe(400);
    expect((await getOrder(h.db, fx.order.id)).state).toBe('entrada_recibida');
  });

  it('409 when the order is not awaiting entry or the window is closed; the stored photo is deleted', async () => {
    const del = vi.spyOn(MemoryBlobStore.prototype, 'del');
    const pending = await seed({ deliveryMode: 'transfer' });
    cookie = `session=${await createSession(h.db, pending.buyer.id, 'user')}`;
    const r1 = await post({ photo: blob(jpg, 'image/jpeg') }, { id: pending.order.id });
    expect(r1.status).toBe(409);
    expect(del).toHaveBeenCalledTimes(1);

    const late = await seed({ startsAt: new Date(Date.now() - 13 * HOUR) });
    cookie = `session=${await createSession(h.db, late.buyer.id, 'user')}`;
    const r2 = await post({ photo: blob(jpg, 'image/jpeg') }, { id: late.order.id });
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toMatch(/horas/);
    expect(del).toHaveBeenCalledTimes(2);
  });
});
