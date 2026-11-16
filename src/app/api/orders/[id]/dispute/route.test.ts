import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@/lib/auth/session';
import { rateLimitHits } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { HOUR, disputesOf, getOrder, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
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
const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

function post(fields: [string, Blob | string][], o: { id?: string; headers?: Record<string, string> } = {}) {
  const fd = new FormData();
  for (const [k, v] of fields) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  const id = o.id ?? fx.order.id;
  const req = new Request(`http://localhost/api/orders/${id}/dispute`, {
    method: 'POST',
    body: fd,
    headers: { host: 'localhost', origin: 'http://localhost', cookie, ...o.headers },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

const seed = (startsAt = new Date(Date.now() + HOUR)) =>
  seedPaidOrder(h.db, new FakeGateway('dispute-route'), {
    deliveryMode: 'file',
    startsAt,
    paidAt: new Date(startsAt.getTime() - 24 * HOUR),
  });

beforeEach(async () => {
  h.db = await makeTestDb();
  fx = await seed();
  cookie = `session=${await createSession(h.db, fx.buyer.id, 'user')}`;
  jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#993366' } }).jpeg().toBuffer();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/orders/[id]/dispute', () => {
  it('opens a dispute with the reason and privately stored evidence', async () => {
    const res = await post([
      ['reason', 'El QR ya había sido usado'],
      ['evidence', blob(jpg, 'image/jpeg')],
      ['evidence', blob(pdf, 'application/pdf')],
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect((await getOrder(h.db, fx.order.id)).state).toBe('disputada');
    const [d] = await disputesOf(h.db, fx.order.id);
    expect(d).toMatchObject({ reason: 'El QR ya había sido usado', status: 'open', openedBy: fx.buyer.id });
    expect(d.evidencePaths).toHaveLength(2);
    for (const p of d.evidencePaths) {
      expect(parseFilePath(p)).toEqual({ kind: 'evidence', ownerId: fx.buyer.id });
      expect(await getStore().get(p)).not.toBeNull();
    }
  });

  it('evidence is optional', async () => {
    expect((await post([['reason', 'No me dejaron entrar']])).status).toBe(200);
    expect((await disputesOf(h.db, fx.order.id))[0].evidencePaths).toEqual([]);
  });

  it('400 for a missing reason, more than 5 files or a bad file, without storing anything', async () => {
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    expect((await post([['evidence', blob(jpg, 'image/jpeg')]])).status).toBe(400);
    expect((await post([['reason', '   ']])).status).toBe(400);
    expect((await post([['reason', 'x'.repeat(2001)]])).status).toBe(400);
    const six: [string, Blob][] = Array.from({ length: 6 }, () => ['evidence', blob(jpg, 'image/jpeg')]);
    expect((await post([['reason', 'Motivo'], ...six])).status).toBe(400);
    expect((await post([['reason', 'Motivo'], ['evidence', 'not a file']])).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
    await h.db.delete(rateLimitHits); // a 6th dispute request today: the 5/day budget is not under test here
    expect((await post([['reason', 'Motivo'], ['evidence', blob(Buffer.from('MZ exe'), 'image/jpeg')]])).status).toBe(400);
    expect(await disputesOf(h.db, fx.order.id)).toHaveLength(0);
  });

  it('401 without a session, 403 for a foreign Origin or a non-buyer, 404 for an unknown order', async () => {
    cookie = '';
    expect((await post([['reason', 'Motivo']])).status).toBe(401);
    cookie = `session=${await createSession(h.db, fx.buyer.id, 'user')}`;
    expect((await post([['reason', 'Motivo']], { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post([['reason', 'Motivo']], { id: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);

    cookie = `session=${await createSession(h.db, fx.seller.id, 'user')}`;
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    expect((await post([['reason', 'Motivo'], ['evidence', blob(jpg, 'image/jpeg')]])).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
    expect(await disputesOf(h.db, fx.order.id)).toHaveLength(0);
  });

  it('409 when a dispute is already open or the window has closed; stored evidence is deleted', async () => {
    expect((await post([['reason', 'Primera']])).status).toBe(200);
    const del = vi.spyOn(MemoryBlobStore.prototype, 'del');
    const again = await post([['reason', 'Segunda'], ['evidence', blob(jpg, 'image/jpeg')]]);
    expect(again.status).toBe(409);
    expect(del).toHaveBeenCalledTimes(1);

    const late = await seed(new Date(Date.now() - 13 * HOUR));
    cookie = `session=${await createSession(h.db, late.buyer.id, 'user')}`;
    const closed = await post(
      [
        ['reason', 'Tarde'],
        ['evidence', blob(jpg, 'image/jpeg')],
        ['evidence', blob(pdf, 'application/pdf')],
      ],
      { id: late.order.id },
    );
    expect(closed.status).toBe(409);
    expect((await closed.json()).error).toMatch(/12 horas/);
    expect(del).toHaveBeenCalledTimes(3);
    expect(await disputesOf(h.db, late.order.id)).toHaveLength(0);
  });
});
