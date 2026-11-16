import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, listings, orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { watermark } from '@/lib/tickets/watermark';
import { MemoryBlobStore } from '@/lib/uploads/store';
import { storePrivate } from '@/lib/uploads/uploads';
import {
  TransferDeadlineError,
  UnsupportedDeliveryError,
  confirmReceived,
  getDeliveredFile,
  watermarkLabel,
} from './delivery';
import { InvalidTransitionError, ORDER_STATES, type OrderState } from './state-machine';
import { newUser, seedListing } from './test-fixtures';

vi.mock('@/lib/tickets/watermark', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/tickets/watermark')>();
  return { ...mod, watermark: vi.fn(mod.watermark) };
});

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-20T15:00:00Z');

let db: Db;
let store: MemoryBlobStore;
let ticketPng: Buffer;

beforeEach(async () => {
  db = await makeTestDb();
  store = new MemoryBlobStore();
  vi.mocked(watermark).mockClear();
  ticketPng = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer();
});

const getOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const auditOf = (orderId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityId, orderId), eq(auditLog.action, action)));

/** Seeds a sale already in `state`, bypassing checkout/webhook. */
async function seedOrder(
  o: {
    state?: OrderState;
    deliveryMode?: 'transfer' | 'file';
    transferDeadline?: Date | null;
    ticket?: Buffer | null;
  } = {},
) {
  const mode = o.deliveryMode ?? 'transfer';
  const s = await seedListing(db, { deliveryMode: mode, status: 'sold', startsAt: new Date(NOW.getTime() + 48 * HOUR) });
  let filePath: string | null = null;
  if (mode === 'file' && o.ticket !== null) {
    filePath = await storePrivate(store, o.ticket ?? ticketPng, 'ticket', s.seller.id);
    await db.update(listings).set({ filePath }).where(eq(listings.id, s.listing.id));
  }
  const deadline =
    o.transferDeadline !== undefined ? o.transferDeadline : mode === 'transfer' ? new Date(NOW.getTime() + HOUR) : null;
  const [order] = await db
    .insert(orders)
    .values({
      listingId: s.listing.id,
      buyerId: s.buyer.id,
      state: o.state ?? (mode === 'transfer' ? 'transferencia_pendiente' : 'entrada_recibida'),
      priceCents: 5000,
      feeCents: 500,
      transferDeadline: deadline,
    })
    .returning();
  return { ...s, order, filePath };
}

const proofPath = (ownerId: string) => `proof/${ownerId}/${randomUUID()}`;

describe('confirmReceived', () => {
  it('moves transferencia_pendiente to entrada_recibida and audits the screenshot path', async () => {
    const { buyer, order } = await seedOrder();
    const shot = proofPath(buyer.id);
    await confirmReceived(db, buyer.id, order.id, shot, NOW);

    expect((await getOrder(order.id)).state).toBe('entrada_recibida');
    const rows = await auditOf(order.id, 'order.received_confirmed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: buyer.id,
      entity: 'order',
      detail: {
        from: 'transferencia_pendiente',
        to: 'entrada_recibida',
        event: 'RECEIVED_CONFIRMED',
        screenshot: { kind: 'proof', path: shot },
      },
    });
  });

  it('rejects anyone but the buyer with ForbiddenError, including the seller', async () => {
    const { seller, order } = await seedOrder();
    const stranger = await newUser(db);
    for (const who of [stranger.id, seller.id]) {
      await expect(confirmReceived(db, who, order.id, proofPath(who), NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
    expect(await auditOf(order.id, 'order.received_confirmed')).toHaveLength(0);
  });

  it('rejects every other state with InvalidTransitionError', async () => {
    const others = ORDER_STATES.filter((s) => s !== 'transferencia_pendiente');
    expect(others).toHaveLength(9);
    for (const state of others) {
      const { buyer, order } = await seedOrder({ state });
      const err = await confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW).catch((e: unknown) => e);
      expect(err, state).toBeInstanceOf(InvalidTransitionError);
      expect((await getOrder(order.id)).state, state).toBe(state);
    }
  });

  it('rejects confirmation at or after the transfer deadline', async () => {
    for (const offset of [0, 1, HOUR]) {
      const { buyer, order } = await seedOrder({ transferDeadline: new Date(NOW.getTime() - offset) });
      await expect(confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW)).rejects.toBeInstanceOf(
        TransferDeadlineError,
      );
      expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
    }
  });

  it('fails closed when a pending transfer has no deadline', async () => {
    const { buyer, order } = await seedOrder({ transferDeadline: null });
    await expect(confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW)).rejects.toBeInstanceOf(
      TransferDeadlineError,
    );
  });

  it('accepts a confirmation one millisecond before the deadline', async () => {
    const { buyer, order } = await seedOrder({ transferDeadline: new Date(NOW.getTime() + 1) });
    await confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW);
    expect((await getOrder(order.id)).state).toBe('entrada_recibida');
  });

  it('throws NotFoundError for an unknown or malformed order id', async () => {
    const buyer = await newUser(db);
    for (const id of [randomUUID(), 'not-a-uuid']) {
      await expect(confirmReceived(db, buyer.id, id, proofPath(buyer.id), NOW)).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("refuses a screenshot path that is not the buyer's own proof file", async () => {
    const { buyer, seller, order } = await seedOrder();
    for (const bad of [proofPath(seller.id), `ticket/${buyer.id}/${randomUUID()}`, '../etc/passwd', '']) {
      await expect(confirmReceived(db, buyer.id, order.id, bad, NOW)).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await getOrder(order.id)).state).toBe('transferencia_pendiente');
  });

  it('lets exactly one of two concurrent confirmations win', async () => {
    const { buyer, order } = await seedOrder();
    const results = await Promise.allSettled([
      confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW),
      confirmReceived(db, buyer.id, order.id, proofPath(buyer.id), NOW),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InvalidTransitionError);
    expect(await auditOf(order.id, 'order.received_confirmed')).toHaveLength(1);
  });
});

describe('watermarkLabel', () => {
  it('shows only the last 4 phone digits and the first 8 chars of the order id', () => {
    const label = watermarkLabel('+50761234567', 'ab12cd34-0000-4000-8000-000000000000');
    expect(label).toBe('+507…4567 · ab12cd34');
    expect(label).not.toContain('61234567');
  });
});

describe('getDeliveredFile', () => {
  const DELIVERABLE: OrderState[] = ['entrada_recibida', 'ingreso_confirmado', 'disputada', 'liberada', 'liquidada'];

  it('delivers only in paid, non-refunded states (state coverage table)', async () => {
    const table: Record<OrderState, boolean> = {
      creada: false,
      transferencia_pendiente: false,
      comprobante_en_revision: false,
      entrada_recibida: true,
      ingreso_confirmado: true,
      disputada: true,
      liberada: true,
      liquidada: true,
      reembolsada: false,
      cancelada: false,
    };
    expect(Object.keys(table).sort()).toEqual([...ORDER_STATES].sort());
    expect(ORDER_STATES.filter((s) => table[s])).toEqual(DELIVERABLE);
    for (const state of ORDER_STATES) {
      const { buyer, order } = await seedOrder({ deliveryMode: 'file', state });
      const res = await getDeliveredFile(db, store, buyer.id, order.id).catch((e: unknown) => e);
      if (table[state]) {
        const { bytes, contentType } = res as { bytes: Buffer; contentType: string };
        expect(contentType, state).toBe('image/jpeg');
        expect((await sharp(bytes).metadata()).format, state).toBe('jpeg');
      } else {
        expect(res, state).toBeInstanceOf(ForbiddenError);
      }
    }
  });

  it('rejects an unpaid (creada) order with ForbiddenError', async () => {
    const { buyer, order } = await seedOrder({ deliveryMode: 'file', state: 'creada' });
    await expect(getDeliveredFile(db, store, buyer.id, order.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(watermark).not.toHaveBeenCalled();
  });

  it('serves only the buyer: another user and the seller get ForbiddenError', async () => {
    const { seller, order } = await seedOrder({ deliveryMode: 'file' });
    const stranger = await newUser(db);
    for (const who of [stranger.id, seller.id]) {
      await expect(getDeliveredFile(db, store, who, order.id)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('returns a watermarked JPEG that is not the raw seller file', async () => {
    const { buyer, order, filePath } = await seedOrder({ deliveryMode: 'file' });
    const raw = (await store.get(filePath!))!;
    const { bytes } = await getDeliveredFile(db, store, buyer.id, order.id);

    expect(bytes.equals(raw)).toBe(false);
    expect(bytes.includes(raw)).toBe(false);
    const meta = await sharp(bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 120, 80]);
    // The overlay darkened the all-white ticket.
    const [red] = (await sharp(bytes).stats()).channels;
    expect(red.mean).toBeLessThan(254);
    // The stored seller file is untouched.
    expect((await store.get(filePath!))!.equals(raw)).toBe(true);
  });

  it('watermarks with the masked buyer phone and short order id, never the full phone', async () => {
    const { buyer, order } = await seedOrder({ deliveryMode: 'file' });
    await getDeliveredFile(db, store, buyer.id, order.id);
    expect(watermark).toHaveBeenCalledTimes(1);
    const text = vi.mocked(watermark).mock.calls[0][1];
    expect(text).toBe(`+507…${buyer.phone!.slice(-4)} · ${order.id.slice(0, 8)}`);
    expect(text).not.toContain(buyer.phone);
  });

  it('has no file to deliver for a transfer-mode listing', async () => {
    const { buyer, order } = await seedOrder({ deliveryMode: 'transfer', state: 'entrada_recibida' });
    await expect(getDeliveredFile(db, store, buyer.id, order.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the listing has no file or the blob is missing', async () => {
    const noFile = await seedOrder({ deliveryMode: 'file', ticket: null });
    await expect(getDeliveredFile(db, store, noFile.buyer.id, noFile.order.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const gone = await seedOrder({ deliveryMode: 'file' });
    await store.del(gone.filePath!);
    await expect(getDeliveredFile(db, store, gone.buyer.id, gone.order.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown or malformed order id', async () => {
    const buyer = await newUser(db);
    await expect(getDeliveredFile(db, store, buyer.id, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeliveredFile(db, store, buyer.id, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never serves a listing file that is not the seller's own ticket upload", async () => {
    const { buyer, seller, order, listing } = await seedOrder({ deliveryMode: 'file' });
    const identity = await storePrivate(store, ticketPng, 'identity', seller.id);
    const othersTicket = await storePrivate(store, ticketPng, 'ticket', buyer.id);
    for (const filePath of [identity, othersTicket]) {
      await db.update(listings).set({ filePath }).where(eq(listings.id, listing.id));
      await expect(getDeliveredFile(db, store, buyer.id, order.id)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(watermark).not.toHaveBeenCalled();
  });

  it('refuses a PDF ticket with UnsupportedDeliveryError and never returns it raw', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF\n');
    const { buyer, order } = await seedOrder({ deliveryMode: 'file', ticket: pdf });
    await expect(getDeliveredFile(db, store, buyer.id, order.id)).rejects.toBeInstanceOf(UnsupportedDeliveryError);
  });

  it('refuses an undecodable stored file with UnsupportedDeliveryError', async () => {
    const corrupt = ticketPng.subarray(0, 40);
    const { buyer, order } = await seedOrder({ deliveryMode: 'file', ticket: corrupt });
    await expect(getDeliveredFile(db, store, buyer.id, order.id)).rejects.toBeInstanceOf(UnsupportedDeliveryError);
  });
});
