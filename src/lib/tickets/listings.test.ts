import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { appConfig, auditLog, events, listings, orders, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { IdentityRequiredError } from '@/lib/identity/errors';
import { InvalidUploadError } from '@/lib/uploads/errors';
import { MemoryBlobStore } from '@/lib/uploads/store';
import { parseFilePath } from '@/lib/uploads/uploads';
import {
  DuplicateTicketError,
  EventClosedError,
  ListingBusyError,
  ListingLimitError,
  ListingStateError,
  PriceCapError,
  ResaleProhibitedError,
  TransferNotAllowedError,
} from './errors';
import { createListing, listVerifiedListings, reviewListing, withdrawListing } from './listings';
import { dbCloner, patternImage, qrPng, qrScreenshot } from './test-helpers';

// Image decoding and QR scanning are CPU-bound: leave headroom for a loaded machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const freshDb = dbCloner();
const NOW = new Date('2026-11-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type ListingStatus = (typeof listings.$inferSelect)['status'];
type IdentityStatus = (typeof users.$inferSelect)['identityStatus'];

let db: Db;
let store: MemoryBlobStore;
let seq = 0;

// Images are generated once: QR scanning is the slow part of these tests.
let ticketA: Buffer; // screenshot of ticket A
let ticketA2: Buffer; // a different rendering of the same ticket A
let ticketB: Buffer;
let accountShot: Buffer; // QR-less screenshot of the seller's account (proof for file mode)
let photoPng: Buffer;
let photoWebp: Buffer; // same picture as photoPng, re-encoded losslessly
const pdf = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF\n');

beforeAll(async () => {
  ticketA = await qrScreenshot('TICKET-A-0001');
  ticketA2 = await qrPng('TICKET-A-0001', { scale: 5 });
  ticketB = await qrScreenshot('TICKET-B-0002', { format: 'png' });
  accountShot = await patternImage(7).jpeg().toBuffer();
  photoPng = await patternImage(1).png().toBuffer();
  photoWebp = await patternImage(1).webp({ lossless: true }).toBuffer();
  await freshDb(); // migrates the template once, outside any single test
});

beforeEach(async () => {
  db = await freshDb();
  store = new MemoryBlobStore();
});
afterEach(() => vi.restoreAllMocks());

async function newUser(identityStatus: IdentityStatus = 'approved', role: 'user' | 'admin' = 'user') {
  const [u] = await db
    .insert(users)
    .values({ phone: `+5076${String(++seq).padStart(7, '0')}`, identityStatus, role })
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
      startsAt: new Date(NOW.getTime() + 7 * DAY),
      faceValueCents: 5000,
      ...o,
    })
    .returning();
  return e;
}

// Inserts a listing row directly (no images, no checks) for state-based tests.
async function rawListing(
  sellerId: string,
  eventId: string,
  o: { status?: ListingStatus; askCents?: number; fingerprint?: string; deliveryMode?: 'transfer' | 'file' } = {},
) {
  const [l] = await db
    .insert(listings)
    .values({
      sellerId,
      eventId,
      askCents: o.askCents ?? 5000,
      deliveryMode: o.deliveryMode ?? 'transfer',
      status: o.status ?? 'pending',
      fingerprint: o.fingerprint ?? `qr:${randomUUID()}`,
      proofPath: `proof/${sellerId}/${randomUUID()}`,
    })
    .returning();
  return l;
}

async function setConfig(key: string, value: string) {
  await db.insert(appConfig).values({ key, value });
}

async function listingRow(id: string) {
  const [l] = await db.select().from(listings).where(eq(listings.id, id));
  return l;
}

async function auditRows(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action));
}

async function storedCount(): Promise<number> {
  return (store as unknown as { items: Map<string, Buffer> }).items.size;
}

describe('createListing', () => {
  let seller: Awaited<ReturnType<typeof newUser>>;
  let event: Awaited<ReturnType<typeof newEvent>>;

  beforeEach(async () => {
    seller = await newUser();
    event = await newEvent();
  });

  const input = (o: Partial<Parameters<typeof createListing>[2]> = {}) => ({
    sellerId: seller.id,
    eventId: event.id,
    askCents: 6000,
    deliveryMode: 'transfer' as const,
    proof: ticketA,
    now: NOW,
    ...o,
  });

  it('creates a pending transfer listing with the QR fingerprint of the proof', async () => {
    const l = await createListing(db, store, input());
    expect(l.status).toBe('pending');
    expect(l.sellerId).toBe(seller.id);
    expect(l.eventId).toBe(event.id);
    expect(l.askCents).toBe(6000);
    expect(l.deliveryMode).toBe('transfer');
    expect(l.fingerprint).toBe(`qr:${sha256('TICKET-A-0001')}`);
    expect(l.filePath).toBeNull();
    expect(parseFilePath(l.proofPath)).toEqual({ kind: 'proof', ownerId: seller.id });
    const stored = (await store.get(l.proofPath))!;
    expect(stored).not.toBeNull();
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(await listingRow(l.id)).toMatchObject({ status: 'pending', fingerprint: l.fingerprint });
  });

  it('writes an audit row by the seller without paths or fingerprint', async () => {
    const l = await createListing(db, store, input());
    const [row] = await auditRows('listing.create');
    expect(row).toMatchObject({ actorId: seller.id, entity: 'listing', entityId: l.id });
    expect(row.detail).toMatchObject({ eventId: event.id, askCents: 6000, deliveryMode: 'transfer', method: 'qr' });
    const detail = JSON.stringify(row.detail);
    expect(detail).not.toContain(l.proofPath);
    expect(detail).not.toContain(l.fingerprint.slice(3));
  });

  it('creates a file listing fingerprinted from the ticket file, not the proof', async () => {
    const l = await createListing(db, store, input({ deliveryMode: 'file', proof: accountShot, file: ticketA }));
    expect(l.deliveryMode).toBe('file');
    expect(l.fingerprint).toBe(`qr:${sha256('TICKET-A-0001')}`);
    expect(parseFilePath(l.filePath!)).toEqual({ kind: 'ticket', ownerId: seller.id });
    expect(parseFilePath(l.proofPath)).toEqual({ kind: 'proof', ownerId: seller.id });
    expect(await store.get(l.filePath!)).not.toBeNull();
    expect(await storedCount()).toBe(2);
  });

  it('uses the img: heuristic when no QR is readable', async () => {
    const l = await createListing(db, store, input({ proof: photoPng }));
    expect(l.fingerprint).toMatch(/^img:[0-9a-f]{64}$/);
  });

  it('accepts a matching declared type and rejects a mismatched one', async () => {
    await expect(createListing(db, store, input({ proofType: 'image/png' }))).rejects.toMatchObject({
      reason: 'type_mismatch',
    });
    const l = await createListing(db, store, input({ proofType: 'image/jpeg' }));
    expect(l.status).toBe('pending');
  });

  describe('rejections (nothing stored, nothing inserted)', () => {
    afterEach(async () => {
      expect(await storedCount()).toBe(0);
      // Insert and audit share one transaction: no audit row means no listing was created.
      expect(await auditRows('listing.create')).toHaveLength(0);
      expect(await db.select().from(listings).where(eq(listings.sellerId, seller.id))).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ askCents: 6000 })]),
      );
    });

    it('rejects a seller id that is not a UUID', async () => {
      await expect(createListing(db, store, input({ sellerId: 'abc' }))).rejects.toBeInstanceOf(ValidationError);
    });

    it.each(['none', 'pending', 'rejected'] as const)('rejects a seller whose identity is %s', async (status) => {
      const s = await newUser(status);
      await expect(createListing(db, store, input({ sellerId: s.id }))).rejects.toBeInstanceOf(IdentityRequiredError);
    });

    it('rejects an unknown seller', async () => {
      await expect(createListing(db, store, input({ sellerId: randomUUID() }))).rejects.toBeInstanceOf(
        IdentityRequiredError,
      );
    });

    it('checks identity before the event', async () => {
      const s = await newUser('none');
      const cancelled = await newEvent({ status: 'cancelled' });
      await expect(
        createListing(db, store, input({ sellerId: s.id, eventId: cancelled.id })),
      ).rejects.toBeInstanceOf(IdentityRequiredError);
    });

    it('rejects an unknown or malformed event id', async () => {
      await expect(createListing(db, store, input({ eventId: randomUUID() }))).rejects.toBeInstanceOf(NotFoundError);
      await expect(createListing(db, store, input({ eventId: 'nope' }))).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects a cancelled event', async () => {
      const e = await newEvent({ status: 'cancelled' });
      await expect(createListing(db, store, input({ eventId: e.id }))).rejects.toBeInstanceOf(EventClosedError);
    });

    it('rejects an event that already started (or starts right now)', async () => {
      const started = await newEvent({ startsAt: new Date(NOW.getTime() - 60_000) });
      await expect(createListing(db, store, input({ eventId: started.id }))).rejects.toBeInstanceOf(EventClosedError);
      const startingNow = await newEvent({ startsAt: NOW });
      await expect(createListing(db, store, input({ eventId: startingNow.id }))).rejects.toBeInstanceOf(
        EventClosedError,
      );
    });

    it('rejects an event that prohibits resale', async () => {
      const e = await newEvent({ resaleProhibited: true });
      await expect(createListing(db, store, input({ eventId: e.id }))).rejects.toBeInstanceOf(ResaleProhibitedError);
    });

    it('rejects transfer delivery when the event does not allow transfers', async () => {
      const e = await newEvent({ allowsTransfer: false });
      await expect(createListing(db, store, input({ eventId: e.id }))).rejects.toBeInstanceOf(TransferNotAllowedError);
    });

    it('rejects an unknown delivery mode', async () => {
      await expect(
        createListing(db, store, input({ deliveryMode: 'pickup' as unknown as 'file' })),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects file delivery without a ticket file', async () => {
      const err = await createListing(db, store, input({ deliveryMode: 'file', proof: accountShot })).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).issues[0].path).toBe('file');
    });

    it('rejects a PDF ticket file in file mode (watermarking needs an image)', async () => {
      const err = await createListing(
        db,
        store,
        input({ deliveryMode: 'file', proof: accountShot, file: pdf }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(InvalidUploadError);
      expect((err as InvalidUploadError).reason).toBe('unsupported_type');
    });

    it('rejects a ticket file in transfer mode', async () => {
      const err = await createListing(db, store, input({ file: ticketB })).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).issues[0].path).toBe('file');
    });

    it('rejects a proof that is not an image', async () => {
      await expect(createListing(db, store, input({ proof: pdf }))).rejects.toBeInstanceOf(InvalidUploadError);
      await expect(createListing(db, store, input({ proof: Buffer.from('MZ-not-an-image') }))).rejects.toBeInstanceOf(
        InvalidUploadError,
      );
    });

    it('rejects a corrupt proof image', async () => {
      await expect(createListing(db, store, input({ proof: ticketA.subarray(0, 200) }))).rejects.toBeInstanceOf(
        InvalidUploadError,
      );
    });

    it.each([0, -100, 10.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31])(
      'rejects an invalid amount (%s)',
      async (askCents) => {
        await expect(createListing(db, store, input({ askCents }))).rejects.toBeInstanceOf(ValidationError);
      },
    );

    it('rejects a price over the default cap (150% of face value)', async () => {
      const err = await createListing(db, store, input({ askCents: 7501 })).catch((e) => e);
      expect(err).toBeInstanceOf(PriceCapError);
      expect((err as PriceCapError).maxCents).toBe(7500);
    });

    it('rejects a price over the cap configured in app_config', async () => {
      await setConfig('priceCapBps', '10000');
      const err = await createListing(db, store, input({ askCents: 5001 })).catch((e) => e);
      expect(err).toBeInstanceOf(PriceCapError);
      expect((err as PriceCapError).maxCents).toBe(5000);
    });

    it('enforces the default limit of 10 active listings per seller', async () => {
      for (let i = 0; i < 10; i++) {
        await rawListing(seller.id, event.id, { status: i % 2 ? 'verified' : 'pending', askCents: 5000 });
      }
      const err = await createListing(db, store, input()).catch((e) => e);
      expect(err).toBeInstanceOf(ListingLimitError);
      expect((err as ListingLimitError).limit).toBe(10);
    });

    it('enforces the per-seller limit configured in app_config', async () => {
      await setConfig('maxActiveListingsPerSeller', '2');
      await rawListing(seller.id, event.id);
      await rawListing(seller.id, event.id, { status: 'verified' });
      const err = await createListing(db, store, input()).catch((e) => e);
      expect(err).toBeInstanceOf(ListingLimitError);
      expect((err as ListingLimitError).limit).toBe(2);
    });

    it('rejects a duplicate of a pending, verified or sold listing', async () => {
      const other = await newUser();
      for (const status of ['pending', 'verified', 'sold'] as const) {
        await rawListing(other.id, event.id, { status, fingerprint: `qr:${sha256('TICKET-A-0001')}` });
        await expect(createListing(db, store, input({ proof: ticketA2 }))).rejects.toBeInstanceOf(
          DuplicateTicketError,
        );
        await db.delete(listings);
      }
    });
  });

  it('accepts a price exactly at the cap and above it when app_config raises the cap', async () => {
    await createListing(db, store, input({ askCents: 7500 }));
    await setConfig('priceCapBps', '20000');
    const l = await createListing(db, store, input({ askCents: 10000, proof: ticketB }));
    expect(l.askCents).toBe(10000);
  });

  it('falls back to the default cap when app_config holds an invalid value', async () => {
    await setConfig('priceCapBps', 'abc');
    await expect(createListing(db, store, input({ askCents: 7501 }))).rejects.toBeInstanceOf(PriceCapError);
    expect((await createListing(db, store, input({ askCents: 7500 }))).status).toBe('pending');
  });

  it('allows file delivery on an event without transfers', async () => {
    const e = await newEvent({ allowsTransfer: false });
    const l = await createListing(
      db,
      store,
      input({ eventId: e.id, deliveryMode: 'file', proof: accountShot, file: ticketA }),
    );
    expect(l.deliveryMode).toBe('file');
  });

  it('does not count rejected, withdrawn or sold listings towards the limit', async () => {
    await setConfig('maxActiveListingsPerSeller', '1');
    for (const status of ['rejected', 'withdrawn', 'sold'] as const) await rawListing(seller.id, event.id, { status });
    expect((await createListing(db, store, input())).status).toBe('pending');
    await expect(createListing(db, store, input({ proof: ticketB }))).rejects.toBeInstanceOf(ListingLimitError);
  });

  it('rejects the same ticket listed again, even as another rendering or by another seller', async () => {
    await createListing(db, store, input());
    const before = await storedCount();
    await expect(createListing(db, store, input({ proof: ticketA2 }))).rejects.toBeInstanceOf(DuplicateTicketError);
    const other = await newUser();
    await expect(createListing(db, store, input({ sellerId: other.id, proof: ticketA2 }))).rejects.toBeInstanceOf(
      DuplicateTicketError,
    );
    expect(await storedCount()).toBe(before);
    expect(await db.select().from(listings)).toHaveLength(1);
  });

  it('detects a QR-less picture re-saved in another format', async () => {
    await createListing(db, store, input({ proof: photoPng }));
    await expect(createListing(db, store, input({ proof: photoWebp }))).rejects.toBeInstanceOf(DuplicateTicketError);
  });

  it('detects a duplicate across delivery modes (file ticket vs transfer proof)', async () => {
    await createListing(db, store, input({ deliveryMode: 'file', proof: accountShot, file: ticketA }));
    await expect(createListing(db, store, input({ proof: ticketA2 }))).rejects.toBeInstanceOf(DuplicateTicketError);
  });

  it.each(['rejected', 'withdrawn'] as const)('lets a %s listing fingerprint be listed again', async (status) => {
    const first = await createListing(db, store, input());
    await db.update(listings).set({ status }).where(eq(listings.id, first.id));
    const again = await createListing(db, store, input({ proof: ticketA2 }));
    expect(again.fingerprint).toBe(first.fingerprint);
    expect(again.status).toBe('pending');
  });

  // Holds every create at its first blob write until `n` creates got there, i.e. until all
  // of them passed the early duplicate/limit checks: only the database can decide then.
  function barrierOnPut(n: number) {
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const put = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (path, data) => {
      if (++arrived === n) release();
      await gate;
      return put(path, data);
    });
  }

  it('lets exactly one of two concurrent creates of the same ticket succeed', async () => {
    const other = await newUser();
    barrierOnPut(2);
    const results = await Promise.allSettled([
      createListing(db, store, input()),
      createListing(db, store, input({ sellerId: other.id, proof: ticketA2 })),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateTicketError);
    expect(await db.select().from(listings)).toHaveLength(1);
    // The loser's blobs were removed: only the winner's proof remains.
    expect(await storedCount()).toBe(1);
  });

  it('maps a unique-index violation from a racing insert to DuplicateTicketError and cleans up', async () => {
    const other = await newUser();
    // Simulates another create committing between our duplicate check and our insert.
    const put = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (path, data) => {
      await rawListing(other.id, event.id, { fingerprint: `qr:${sha256('TICKET-A-0001')}` });
      return put(path, data);
    });
    await expect(createListing(db, store, input())).rejects.toBeInstanceOf(DuplicateTicketError);
    expect(await storedCount()).toBe(0);
    expect(await db.select().from(listings).where(eq(listings.sellerId, seller.id))).toHaveLength(0);
    expect(await auditRows('listing.create')).toHaveLength(0);
  });

  it('does not exceed the per-seller limit with concurrent creates', async () => {
    await setConfig('maxActiveListingsPerSeller', '1');
    barrierOnPut(2);
    const results = await Promise.allSettled([
      createListing(db, store, input()),
      createListing(db, store, input({ proof: ticketB })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ListingLimitError);
    expect(await storedCount()).toBe(1);
  });

  it('deletes the stored blobs when the insert fails', async () => {
    vi.spyOn(db, 'transaction').mockImplementation((() => {
      throw new Error('db down');
    }) as unknown as Db['transaction']);
    await expect(
      createListing(db, store, input({ deliveryMode: 'file', proof: accountShot, file: ticketA })),
    ).rejects.toThrow('db down');
    expect(await storedCount()).toBe(0);
  });

  it('re-checks the seller identity inside the insert transaction', async () => {
    // Identity revoked between the early check and the insert.
    const put = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (path, data) => {
      await db.update(users).set({ identityStatus: 'rejected' }).where(eq(users.id, seller.id));
      return put(path, data);
    });
    await expect(createListing(db, store, input())).rejects.toBeInstanceOf(IdentityRequiredError);
    expect(await storedCount()).toBe(0);
  });

  it('re-checks the event inside the insert transaction', async () => {
    const put = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (path, data) => {
      await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, event.id));
      return put(path, data);
    });
    await expect(createListing(db, store, input())).rejects.toBeInstanceOf(EventClosedError);
    expect(await storedCount()).toBe(0);
  });
});

describe('reviewListing', () => {
  let adminUser: Awaited<ReturnType<typeof newUser>>;
  let admin: Actor;
  let sellerId: string;
  let eventId: string;

  beforeEach(async () => {
    adminUser = await newUser('none', 'admin');
    admin = { userId: adminUser.id, role: 'admin', mfa: true };
    sellerId = (await newUser()).id;
    eventId = (await newEvent()).id;
  });

  it.each([
    ['a regular user', { role: 'user', mfa: true }],
    ['an admin without 2FA', { role: 'admin', mfa: false }],
  ] as const)('rejects %s', async (_label, a) => {
    const l = await rawListing(sellerId, eventId);
    await expect(
      reviewListing(db, { userId: adminUser.id, ...a }, l.id, 'verified'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listingRow(l.id)).status).toBe('pending');
  });

  it('verifies a pending listing and audits it', async () => {
    const l = await rawListing(sellerId, eventId);
    await reviewListing(db, admin, l.id, 'verified');
    expect((await listingRow(l.id)).status).toBe('verified');
    const [row] = await auditRows('listing.review');
    expect(row).toMatchObject({ actorId: admin.userId, entity: 'listing', entityId: l.id });
    expect(row.detail).toMatchObject({ decision: 'verified', from: 'pending' });
  });

  it('rejects a pending listing with a reason', async () => {
    const l = await rawListing(sellerId, eventId);
    await reviewListing(db, admin, l.id, 'rejected', 'La captura no muestra el nombre del titular');
    expect((await listingRow(l.id)).status).toBe('rejected');
    const [row] = await auditRows('listing.review');
    expect(row.detail).toMatchObject({
      decision: 'rejected',
      reason: 'La captura no muestra el nombre del titular',
    });
  });

  it.each(['verified', 'rejected', 'sold', 'withdrawn'] as const)(
    'refuses to review a %s listing again',
    async (status) => {
      const l = await rawListing(sellerId, eventId, { status });
      await expect(reviewListing(db, admin, l.id, 'verified')).rejects.toBeInstanceOf(ListingStateError);
      await expect(reviewListing(db, admin, l.id, 'rejected')).rejects.toBeInstanceOf(ListingStateError);
      expect((await listingRow(l.id)).status).toBe(status);
      expect(await auditRows('listing.review')).toHaveLength(0);
    },
  );

  it('cannot review twice', async () => {
    const l = await rawListing(sellerId, eventId);
    await reviewListing(db, admin, l.id, 'rejected');
    await expect(reviewListing(db, admin, l.id, 'verified')).rejects.toBeInstanceOf(ListingStateError);
    expect((await listingRow(l.id)).status).toBe('rejected');
  });

  it('throws NotFoundError for an unknown or malformed listing id', async () => {
    await expect(reviewListing(db, admin, randomUUID(), 'verified')).rejects.toBeInstanceOf(NotFoundError);
    await expect(reviewListing(db, admin, 'x', 'verified')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an invalid decision or an over-long reason', async () => {
    const l = await rawListing(sellerId, eventId);
    await expect(
      reviewListing(db, admin, l.id, 'approved' as unknown as 'verified'),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(reviewListing(db, admin, l.id, 'rejected', 'x'.repeat(501))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await listingRow(l.id)).status).toBe('pending');
  });

  it('does not let an admin review their own listing', async () => {
    const l = await rawListing(adminUser.id, eventId);
    await expect(reviewListing(db, admin, l.id, 'verified')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listingRow(l.id)).status).toBe('pending');
  });
});

describe('withdrawListing', () => {
  let seller: Awaited<ReturnType<typeof newUser>>;
  let eventId: string;

  beforeEach(async () => {
    seller = await newUser();
    eventId = (await newEvent()).id;
  });

  async function addOrder(listingId: string, state: (typeof orders.$inferSelect)['state']) {
    const buyer = await newUser('none');
    await db.insert(orders).values({ listingId, buyerId: buyer.id, state, priceCents: 5000, feeCents: 500 });
  }

  it.each(['pending', 'verified'] as const)('withdraws a %s listing and audits it', async (status) => {
    const l = await rawListing(seller.id, eventId, { status });
    await withdrawListing(db, seller.id, l.id);
    expect((await listingRow(l.id)).status).toBe('withdrawn');
    const [row] = await auditRows('listing.withdraw');
    expect(row).toMatchObject({ actorId: seller.id, entity: 'listing', entityId: l.id });
    expect(row.detail).toMatchObject({ from: status });
  });

  it('only lets the seller withdraw', async () => {
    const l = await rawListing(seller.id, eventId);
    const other = await newUser();
    await expect(withdrawListing(db, other.id, l.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withdrawListing(db, 'not-a-uuid', l.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listingRow(l.id)).status).toBe('pending');
  });

  it.each(['sold', 'rejected', 'withdrawn'] as const)('refuses to withdraw a %s listing', async (status) => {
    const l = await rawListing(seller.id, eventId, { status });
    await expect(withdrawListing(db, seller.id, l.id)).rejects.toBeInstanceOf(ListingStateError);
    expect((await listingRow(l.id)).status).toBe(status);
    expect(await auditRows('listing.withdraw')).toHaveLength(0);
  });

  it.each(['creada', 'transferencia_pendiente', 'entrada_recibida', 'disputada'] as const)(
    'refuses while a live order (%s) exists',
    async (state) => {
      const l = await rawListing(seller.id, eventId, { status: 'verified' });
      await addOrder(l.id, state);
      await expect(withdrawListing(db, seller.id, l.id)).rejects.toBeInstanceOf(ListingBusyError);
      expect((await listingRow(l.id)).status).toBe('verified');
    },
  );

  it('allows withdrawal when previous orders were cancelled or refunded', async () => {
    const l = await rawListing(seller.id, eventId, { status: 'verified' });
    await addOrder(l.id, 'cancelada');
    await addOrder(l.id, 'reembolsada');
    await withdrawListing(db, seller.id, l.id);
    expect((await listingRow(l.id)).status).toBe('withdrawn');
  });

  it('throws NotFoundError for an unknown or malformed listing id', async () => {
    await expect(withdrawListing(db, seller.id, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(withdrawListing(db, seller.id, '../etc')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('frees the fingerprint for a new listing', async () => {
    const input = {
      sellerId: seller.id,
      eventId,
      askCents: 5000,
      deliveryMode: 'transfer' as const,
      proof: ticketA,
      now: NOW,
    };
    const first = await createListing(db, store, input);
    await expect(createListing(db, store, { ...input, proof: ticketA2 })).rejects.toBeInstanceOf(
      DuplicateTicketError,
    );
    await withdrawListing(db, seller.id, first.id);
    expect((await createListing(db, store, { ...input, proof: ticketA2 })).status).toBe('pending');
  });
});

describe('listVerifiedListings', () => {
  it('returns only verified listings of the event, cheapest first, with public fields only', async () => {
    const seller = await newUser();
    const event = await newEvent();
    const otherEvent = await newEvent();
    const b = await rawListing(seller.id, event.id, { status: 'verified', askCents: 7000 });
    const a = await rawListing(seller.id, event.id, { status: 'verified', askCents: 5500, deliveryMode: 'file' });
    for (const status of ['pending', 'rejected', 'withdrawn', 'sold'] as const) {
      await rawListing(seller.id, event.id, { status, askCents: 1000 });
    }
    await rawListing(seller.id, otherEvent.id, { status: 'verified', askCents: 1000 });

    const list = await listVerifiedListings(db, event.id, NOW);
    expect(list).toEqual([
      { id: a.id, askCents: 5500, deliveryMode: 'file', eventId: event.id },
      { id: b.id, askCents: 7000, deliveryMode: 'transfer', eventId: event.id },
    ]);
    for (const item of list) expect(Object.keys(item).sort()).toEqual(['askCents', 'deliveryMode', 'eventId', 'id']);
    const json = JSON.stringify(list);
    expect(json).not.toContain(seller.id);
    expect(json).not.toContain('proof/');
    expect(json).not.toContain('qr:');
  });

  it('returns nothing for cancelled, started, unknown or malformed events', async () => {
    const seller = await newUser();
    const cancelled = await newEvent({ status: 'cancelled' });
    const started = await newEvent({ startsAt: new Date(NOW.getTime() - 1000) });
    await rawListing(seller.id, cancelled.id, { status: 'verified' });
    await rawListing(seller.id, started.id, { status: 'verified' });
    expect(await listVerifiedListings(db, cancelled.id, NOW)).toEqual([]);
    expect(await listVerifiedListings(db, started.id, NOW)).toEqual([]);
    expect(await listVerifiedListings(db, randomUUID(), NOW)).toEqual([]);
    expect(await listVerifiedListings(db, "1' or '1'='1", NOW)).toEqual([]);
  });

  it('defaults to the current time', async () => {
    const seller = await newUser();
    const future = await newEvent({ startsAt: new Date(Date.now() + DAY) });
    await rawListing(seller.id, future.id, { status: 'verified' });
    const past = await newEvent({ startsAt: new Date(Date.now() - DAY) });
    await rawListing(seller.id, past.id, { status: 'verified' });
    expect(await listVerifiedListings(db, future.id)).toHaveLength(1);
    expect(await listVerifiedListings(db, past.id)).toEqual([]);
  });
});
