import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@/lib/auth/session';
import { events, listings, orders, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { MemoryBlobStore } from '@/lib/uploads/store';
import { dbCloner, patternImage, qrPng, qrScreenshot } from './test-helpers';

// Image decoding and QR scanning are CPU-bound: leave headroom for a loaded machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const freshDb = dbCloner();
let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

import { POST } from '@/app/api/listings/route';
import { DELETE } from '@/app/api/listings/[id]/route';
import { GET } from '@/app/api/events/[id]/listings/route';

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = { host: 'localhost', origin: 'http://localhost' };

let ticket: Buffer;
let ticketSame: Buffer;
let accountShot: Buffer;
const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');

let seq = 0;
let seller: typeof users.$inferSelect;
let cookie: string;
let event: typeof events.$inferSelect;

beforeAll(async () => {
  ticket = await qrScreenshot('ROUTE-TICKET-1');
  ticketSame = await qrPng('ROUTE-TICKET-1', { scale: 6 });
  accountShot = await patternImage(5).jpeg().toBuffer();
  await freshDb(); // migrates the template once, outside any single test
});

async function newUser(identityStatus: (typeof users.$inferSelect)['identityStatus'] = 'approved') {
  const [u] = await db
    .insert(users)
    .values({ phone: `+5076${String(++seq).padStart(7, '0')}`, identityStatus })
    .returning();
  return u;
}

async function newEvent(o: Partial<typeof events.$inferInsert> = {}) {
  const [e] = await db
    .insert(events)
    .values({
      name: 'Concierto',
      venue: 'Atlapa',
      lat: 9,
      lng: -79.5,
      radiusM: 500,
      startsAt: new Date(Date.now() + 7 * DAY),
      faceValueCents: 5000,
      ...o,
    })
    .returning();
  return e;
}

beforeEach(async () => {
  db = await freshDb();
  seller = await newUser();
  cookie = `session=${await createSession(db, seller.id, 'user')}`;
  event = await newEvent();
});
afterEach(() => vi.restoreAllMocks());

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

function form(fields: Record<string, Blob | string>, headers: Record<string, string> = {}): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  return new Request('http://localhost/api/listings', {
    method: 'POST',
    body: fd,
    headers: { ...ORIGIN, cookie, ...headers },
  });
}

const fields = (o: Record<string, Blob | string> = {}) => ({
  eventId: event.id,
  askCents: '6000',
  deliveryMode: 'transfer',
  proof: blob(ticket, 'image/jpeg'),
  ...o,
});

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

describe('POST /api/listings', () => {
  it('creates a pending listing and returns only its id and status', async () => {
    const res = await POST(form(fields()));
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['id', 'status']);
    expect(body.status).toBe('pending');
    const [row] = await db.select().from(listings).where(eq(listings.id, body.id as string));
    expect(row).toMatchObject({ sellerId: seller.id, eventId: event.id, askCents: 6000, deliveryMode: 'transfer' });
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('creates a file listing with the ticket image', async () => {
    const res = await POST(
      form(fields({ deliveryMode: 'file', proof: blob(accountShot, 'image/jpeg'), file: blob(ticket, 'image/jpeg') })),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await db.select().from(listings).where(eq(listings.id, id));
    expect(row.filePath).not.toBeNull();
  });

  it('treats an empty file part (no file chosen) as no file', async () => {
    const res = await POST(form(fields({ file: blob(Buffer.alloc(0), 'application/octet-stream') })));
    expect(res.status).toBe(201);
  });

  it('returns 401 without a session', async () => {
    cookie = '';
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    expect((await POST(form(fields()))).status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('returns 415 for a non-multipart body', async () => {
    const req = new Request('http://localhost/api/listings', {
      method: 'POST',
      body: JSON.stringify({ eventId: event.id }),
      headers: { ...ORIGIN, cookie, 'content-type': 'application/json' },
    });
    expect((await POST(req)).status).toBe(415);
  });

  it('returns 403 for a foreign or missing Origin', async () => {
    expect((await POST(form(fields(), { origin: 'https://evil.example' }))).status).toBe(403);
    const noOrigin = form(fields());
    noOrigin.headers.delete('origin');
    expect((await POST(noOrigin)).status).toBe(403);
    expect(await db.select().from(listings)).toHaveLength(0);
  });

  it('returns 403 before reading the files when the identity is not approved', async () => {
    await db.update(users).set({ identityStatus: 'pending' }).where(eq(users.id, seller.id));
    const put = vi.spyOn(MemoryBlobStore.prototype, 'put');
    const res = await POST(form(fields()));
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatch(/identidad/i);
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ['missing proof', { proof: '' }],
    ['non-numeric price', { askCents: 'abc' }],
    ['fractional price', { askCents: '60.50' }],
    ['zero price', { askCents: '0' }],
    ['bad delivery mode', { deliveryMode: 'pickup' }],
    ['missing event id', { eventId: '' }],
  ])('returns 400 for %s', async (_label, o) => {
    const f: Record<string, Blob | string> = fields();
    for (const [k, v] of Object.entries(o)) {
      if (v === '') delete f[k];
      else f[k] = v;
    }
    expect((await POST(form(f))).status).toBe(400);
  });

  it('returns 400 when file delivery has no ticket file', async () => {
    const res = await POST(form(fields({ deliveryMode: 'file', proof: blob(accountShot, 'image/jpeg') })));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/entrada/i);
  });

  it('returns 400 for a PDF ticket in file mode', async () => {
    const res = await POST(
      form(fields({ deliveryMode: 'file', proof: blob(accountShot, 'image/jpeg'), file: blob(pdf, 'application/pdf') })),
    );
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/JPG, PNG o WebP/);
    expect(await errorOf(await POST(form(fields({ proof: blob(pdf, 'application/pdf') }))))).not.toMatch(/PDF/);
  });

  it('returns 400 when the declared type does not match the bytes', async () => {
    expect((await POST(form(fields({ proof: blob(ticket, 'image/png') })))).status).toBe(400);
  });

  it('returns 404 for an unknown event', async () => {
    expect((await POST(form(fields({ eventId: randomUUID() })))).status).toBe(404);
  });

  it('returns 409 for a ticket that is already listed', async () => {
    expect((await POST(form(fields()))).status).toBe(201);
    const res = await POST(form(fields({ proof: blob(ticketSame, 'image/png') })));
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(/ya está publicada/i);
  });

  it('returns 422 when the ticket file QR differs from the proof QR', async () => {
    const other = await qrScreenshot('ROUTE-TICKET-OTHER', { format: 'png' });
    const res = await POST(
      form(fields({ deliveryMode: 'file', proof: blob(ticket, 'image/jpeg'), file: blob(other, 'image/png') })),
    );
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatch(/no coincide/i);
    expect(await db.select().from(listings)).toHaveLength(0);
  });

  it('returns 422 with the maximum for a price over the cap', async () => {
    const res = await POST(form(fields({ askCents: '7501' })));
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toContain('75.00');
  });

  it.each([
    ['a cancelled event', { status: 'cancelled' as const }, /no admite/i],
    ['a started event', { startsAt: new Date(Date.now() - 1000) }, /no admite/i],
    ['an event that prohibits resale', { resaleProhibited: true }, /prohíbe/i],
    ['transfer on an event without transfers', { allowsTransfer: false }, /transferir/i],
  ])('returns 422 for %s', async (_label, o, message) => {
    const e = await newEvent(o);
    const res = await POST(form(fields({ eventId: e.id })));
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatch(message);
  });

  it('returns 422 when the seller reached the active listing limit', async () => {
    for (let i = 0; i < 10; i++) {
      await db.insert(listings).values({
        sellerId: seller.id,
        eventId: event.id,
        askCents: 5000,
        deliveryMode: 'transfer',
        fingerprint: `qr:${randomUUID()}`,
        proofPath: `proof/${seller.id}/${randomUUID()}`,
      });
    }
    const res = await POST(form(fields()));
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatch(/máximo/i);
  });

  it('returns 413 when Content-Length exceeds the limit', async () => {
    const req = new Request('http://localhost/api/listings', {
      method: 'POST',
      body: new Uint8Array(16),
      headers: {
        ...ORIGIN,
        cookie,
        'content-type': 'multipart/form-data; boundary=xyz',
        'content-length': String(17 * 1024 * 1024),
      },
    });
    expect((await POST(req)).status).toBe(413);
  });

  it('returns 500 without leaking the error message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db, 'transaction').mockImplementation((() => {
      throw new Error('secret +50760000001');
    }) as unknown as Db['transaction']);
    const res = await POST(form(fields()));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret');
  });
});

describe('DELETE /api/listings/[id]', () => {
  async function listing(status: (typeof listings.$inferSelect)['status'] = 'verified', sellerId = seller.id) {
    const [l] = await db
      .insert(listings)
      .values({
        sellerId,
        eventId: event.id,
        askCents: 5000,
        deliveryMode: 'transfer',
        status,
        fingerprint: `qr:${randomUUID()}`,
        proofPath: `proof/${sellerId}/${randomUUID()}`,
      })
      .returning();
    return l;
  }

  function del(id: string, headers: Record<string, string> = {}) {
    const req = new Request(`http://localhost/api/listings/${id}`, {
      method: 'DELETE',
      headers: { ...ORIGIN, cookie, ...headers },
    });
    return DELETE(req, { params: Promise.resolve({ id }) });
  }

  async function status(id: string) {
    const [l] = await db.select().from(listings).where(eq(listings.id, id));
    return l.status;
  }

  it('withdraws the seller listing', async () => {
    const l = await listing();
    const res = await del(l.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'withdrawn' });
    expect(await status(l.id)).toBe('withdrawn');
  });

  it('returns 401 without a session', async () => {
    const l = await listing();
    cookie = '';
    expect((await del(l.id)).status).toBe(401);
    expect(await status(l.id)).toBe('verified');
  });

  it('returns 403 for a foreign or missing Origin', async () => {
    const l = await listing();
    expect((await del(l.id, { origin: 'https://evil.example' })).status).toBe(403);
    const req = new Request(`http://localhost/api/listings/${l.id}`, {
      method: 'DELETE',
      headers: { host: 'localhost', cookie },
    });
    expect((await DELETE(req, { params: Promise.resolve({ id: l.id }) })).status).toBe(403);
    expect(await status(l.id)).toBe('verified');
  });

  it("returns 403 for another user's listing", async () => {
    const other = await newUser();
    const l = await listing('verified', other.id);
    expect((await del(l.id)).status).toBe(403);
    expect(await status(l.id)).toBe('verified');
  });

  it('returns 404 for an unknown or malformed id', async () => {
    expect((await del(randomUUID())).status).toBe(404);
    expect((await del('nope')).status).toBe(404);
  });

  it('returns 409 for a sold listing or one with a live order', async () => {
    const sold = await listing('sold');
    expect((await del(sold.id)).status).toBe(409);
    const busy = await listing('verified');
    const buyer = await newUser('none');
    await db.insert(orders).values({ listingId: busy.id, buyerId: buyer.id, priceCents: 5000, feeCents: 500 });
    const res = await del(busy.id);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(/compra en curso/i);
  });
});

describe('GET /api/events/[id]/listings', () => {
  const get = (id: string) =>
    GET(new Request(`http://localhost/api/events/${id}/listings`), { params: Promise.resolve({ id }) });

  it('is public and exposes only id, price, delivery mode and event id', async () => {
    const values = (askCents: number, status: 'verified' | 'pending') => ({
      sellerId: seller.id,
      eventId: event.id,
      askCents,
      deliveryMode: 'transfer' as const,
      status,
      fingerprint: `qr:${randomUUID()}`,
      proofPath: `proof/${seller.id}/${randomUUID()}`,
      filePath: `ticket/${seller.id}/${randomUUID()}`,
    });
    await db.insert(listings).values([values(7000, 'verified'), values(6000, 'verified'), values(1000, 'pending')]);

    const res = await get(event.id);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { listings: Record<string, unknown>[] };
    expect(body.listings.map((l) => l.askCents)).toEqual([6000, 7000]);
    for (const l of body.listings) {
      expect(Object.keys(l).sort()).toEqual(['askCents', 'deliveryMode', 'eventId', 'id']);
      expect(l.eventId).toBe(event.id);
    }
    expect(text).not.toContain(seller.id);
    expect(text).not.toContain('proof/');
    expect(text).not.toContain('ticket/');
    expect(text).not.toContain('qr:');
  });

  it('returns an empty list for an unknown or malformed event', async () => {
    expect(await (await get(randomUUID())).json()).toEqual({ listings: [] });
    expect(await (await get('x')).json()).toEqual({ listings: [] });
  });
});
