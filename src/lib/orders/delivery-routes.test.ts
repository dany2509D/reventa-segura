import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, listings, orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { createSession } from '@/lib/auth/session';
import { MemoryBlobStore, getStore } from '@/lib/uploads/store';
import { parseFilePath, storePrivate } from '@/lib/uploads/uploads';
import type { OrderState } from './state-machine';
import { newUser, seedListing } from './test-fixtures';

let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

import { POST as receivedPOST } from '@/app/api/orders/[id]/received/route';
import { GET as ticketGET } from '@/app/api/orders/[id]/ticket/route';

const HOUR = 60 * 60 * 1000;
let png: Buffer;

beforeEach(async () => {
  db = await makeTestDb();
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ffffff' } })
    .png()
    .withExif({ IFD0: { Artist: 'SECRET-BUYER-SCREEN' } })
    .toBuffer();
});
afterEach(() => vi.restoreAllMocks());

const cookieFor = async (userId: string) => `session=${await createSession(db, userId, 'user')}`;
const getOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedOrder(o: { state?: OrderState; deliveryMode?: 'transfer' | 'file'; deadline?: Date; ticket?: Buffer }) {
  const mode = o.deliveryMode ?? 'transfer';
  const s = await seedListing(db, { deliveryMode: mode, status: 'sold' });
  let filePath: string | null = null;
  if (mode === 'file') {
    filePath = await storePrivate(getStore(), o.ticket ?? png, 'ticket', s.seller.id);
    await db.update(listings).set({ filePath }).where(eq(listings.id, s.listing.id));
  }
  const [order] = await db
    .insert(orders)
    .values({
      listingId: s.listing.id,
      buyerId: s.buyer.id,
      state: o.state ?? (mode === 'transfer' ? 'transferencia_pendiente' : 'entrada_recibida'),
      priceCents: 5000,
      feeCents: 500,
      transferDeadline: mode === 'transfer' ? (o.deadline ?? new Date(Date.now() + HOUR)) : null,
    })
    .returning();
  return { ...s, order, filePath };
}

function received(
  id: string,
  cookie: string,
  fields: Record<string, Blob | string> = { screenshot: blob(png, 'image/png') },
  headers: Record<string, string> = {},
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  const req = new Request(`http://localhost/api/orders/${id}/received`, {
    method: 'POST',
    body: fd,
    headers: { host: 'localhost', origin: 'http://localhost', cookie, ...headers },
  });
  return receivedPOST(req, params(id));
}

function ticket(id: string, cookie?: string) {
  const req = new Request(`http://localhost/api/orders/${id}/ticket`, {
    headers: cookie ? { cookie } : {},
  });
  return ticketGET(req, params(id));
}

describe('POST /api/orders/[id]/received', () => {
  it('stores the screenshot privately, confirms receipt and audits the path', async () => {
    const { buyer, order } = await seedOrder({});
    const res = await received(order.id, await cookieFor(buyer.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await getOrder(order.id)).state).toBe('entrada_recibida');

    const [row] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, 'order.received_confirmed')));
    const path = (row.detail as { screenshot: { kind: string; path: string } }).screenshot.path;
    expect(parseFilePath(path)).toEqual({ kind: 'proof', ownerId: buyer.id });
    const stored = (await getStore().get(path))!;
    expect(stored.includes('SECRET-BUYER-SCREEN')).toBe(false);
    expect(await res.text()).not.toContain(path);
  });

  it('returns 415 for a non-multipart body', async () => {
    const { buyer, order } = await seedOrder({});
    const req = new Request(`http://localhost/api/orders/${order.id}/received`, {
      method: 'POST',
      body: JSON.stringify({ screenshot: 'x' }),
      headers: {
        'content-type': 'application/json',
        host: 'localhost',
        origin: 'http://localhost',
        cookie: await cookieFor(buyer.id),
      },
    });
    expect((await receivedPOST(req, params(order.id))).status).toBe(415);
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
  });

  it('returns 403 for a foreign or missing Origin', async () => {
    const { buyer, order } = await seedOrder({});
    const cookie = await cookieFor(buyer.id);
    expect((await received(order.id, cookie, undefined, { origin: 'https://evil.example' })).status).toBe(403);
    const fd = new FormData();
    fd.append('screenshot', blob(png, 'image/png'), 's.png');
    const noOrigin = new Request(`http://localhost/api/orders/${order.id}/received`, {
      method: 'POST',
      body: fd,
      headers: { host: 'localhost', cookie },
    });
    expect((await receivedPOST(noOrigin, params(order.id))).status).toBe(403);
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
  });

  it('returns 401 without a session', async () => {
    const { order } = await seedOrder({});
    expect((await received(order.id, '')).status).toBe(401);
  });

  it('returns 403 for a user who is not the buyer, without storing anything', async () => {
    const { seller, order } = await seedOrder({});
    const stranger = await newUser(db);
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    for (const who of [stranger.id, seller.id]) {
      const res = await received(order.id, await cookieFor(who));
      expect(res.status).toBe(403);
      expect(JSON.stringify(await res.json())).not.toMatch(/\+507/);
    }
    expect(put).not.toHaveBeenCalled();
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
  });

  it('returns 404 for an unknown or malformed order id', async () => {
    const buyer = await newUser(db);
    const cookie = await cookieFor(buyer.id);
    expect((await received(randomUUID(), cookie)).status).toBe(404);
    expect((await received('not-a-uuid', cookie)).status).toBe(404);
  });

  it('returns 409 for a wrong state or a passed deadline, without storing anything', async () => {
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    const done = await seedOrder({ state: 'entrada_recibida' });
    expect((await received(done.order.id, await cookieFor(done.buyer.id))).status).toBe(409);
    const late = await seedOrder({ deadline: new Date(Date.now() - 1000) });
    expect((await received(late.order.id, await cookieFor(late.buyer.id))).status).toBe(409);
    expect((await getOrder(late.order.id)).state).toBe('transferencia_pendiente');
    expect(put).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing, non-image or PDF screenshot', async () => {
    const { buyer, order } = await seedOrder({});
    const cookie = await cookieFor(buyer.id);
    expect((await received(order.id, cookie, {})).status).toBe(400);
    expect((await received(order.id, cookie, { screenshot: 'text' })).status).toBe(400);
    expect((await received(order.id, cookie, { screenshot: blob(Buffer.from('MZ....'), 'image/png') })).status).toBe(
      400,
    );
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    expect((await received(order.id, cookie, { screenshot: blob(pdf, 'application/pdf') })).status).toBe(400);
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
  });

  it('returns 413 when Content-Length exceeds the limit', async () => {
    const { buyer, order } = await seedOrder({});
    const req = new Request(`http://localhost/api/orders/${order.id}/received`, {
      method: 'POST',
      body: new Uint8Array(16),
      headers: {
        'content-type': 'multipart/form-data; boundary=xyz',
        'content-length': String(9 * 1024 * 1024),
        host: 'localhost',
        origin: 'http://localhost',
        cookie: await cookieFor(buyer.id),
      },
    });
    expect((await receivedPOST(req, params(order.id))).status).toBe(413);
  });

  it('deletes the stored screenshot when the confirmation fails, and logs no PII', async () => {
    const { buyer, order } = await seedOrder({});
    const cookie = await cookieFor(buyer.id);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const del = vi.spyOn(MemoryBlobStore.prototype, 'del');
    const realTx = db.transaction.bind(db);
    vi.spyOn(db, 'transaction')
      .mockImplementationOnce(realTx) // the route's rate limiter
      .mockImplementation((() => {
        throw new Error(`db down for ${buyer.phone}`);
      }) as unknown as Db['transaction']);
    const res = await received(order.id, cookie);
    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(err.mock.calls)).not.toContain(buyer.phone);
  });
});

describe('GET /api/orders/[id]/ticket', () => {
  it('serves the watermarked JPEG to the buyer with private, no-store headers', async () => {
    const { buyer, order, filePath } = await seedOrder({ deliveryMode: 'file' });
    const res = await ticket(order.id, await cookieFor(buyer.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="entrada.jpg"');

    const body = Buffer.from(await res.arrayBuffer());
    const raw = (await getStore().get(filePath!))!;
    expect(body.equals(raw)).toBe(false);
    const meta = await sharp(body).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 64, 48]);
  });

  it('returns 401 without a session', async () => {
    const { order } = await seedOrder({ deliveryMode: 'file' });
    expect((await ticket(order.id)).status).toBe(401);
  });

  it('returns 403 for another user and for an unpaid order', async () => {
    const paid = await seedOrder({ deliveryMode: 'file' });
    const stranger = await newUser(db);
    expect((await ticket(paid.order.id, await cookieFor(stranger.id))).status).toBe(403);
    expect((await ticket(paid.order.id, await cookieFor(paid.seller.id))).status).toBe(403);
    const unpaid = await seedOrder({ deliveryMode: 'file', state: 'creada' });
    const res = await ticket(unpaid.order.id, await cookieFor(unpaid.buyer.id));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 404 for an unknown or malformed id and for a transfer-mode order', async () => {
    const buyer = await newUser(db);
    const cookie = await cookieFor(buyer.id);
    expect((await ticket(randomUUID(), cookie)).status).toBe(404);
    expect((await ticket('nope', cookie)).status).toBe(404);
    const transfer = await seedOrder({ state: 'entrada_recibida' });
    expect((await ticket(transfer.order.id, await cookieFor(transfer.buyer.id))).status).toBe(404);
  });

  it('returns 409 for a PDF ticket and never sends the raw file', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const { buyer, order } = await seedOrder({ deliveryMode: 'file', ticket: pdf });
    const res = await ticket(order.id, await cookieFor(buyer.id));
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toMatch(/json/);
    expect(await res.text()).not.toContain('%PDF');
  });

  it('returns 500 with a generic message and logs no PII when storage fails', async () => {
    const { buyer, order } = await seedOrder({ deliveryMode: 'file' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(MemoryBlobStore.prototype, 'get').mockRejectedValue(new Error(`boom ${buyer.phone}`));
    const res = await ticket(order.id, await cookieFor(buyer.id));
    expect(res.status).toBe(500);
    expect(JSON.stringify(err.mock.calls)).not.toContain(buyer.phone);
    expect(await res.text()).not.toContain(buyer.phone);
  });
});
