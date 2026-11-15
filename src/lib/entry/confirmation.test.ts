import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@/lib/db/test-db';
import type { Db } from '@/lib/db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { HOUR, auditOf, filePath, getOrder, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { newUser } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { EntryWindowError, confirmEntry, confirmationWindowEndsAt } from './confirmation';

const STARTS = new Date('2026-12-01T20:00:00Z');
const at = (msFromStart: number) => new Date(STARTS.getTime() + msFromStart);
// The fixture venue is at (9, -79.5) with a 500 m radius.
const AT_VENUE = { lat: 9.001, lng: -79.5 }; // ~111 m away
const FAR_AWAY = { lat: 9.05, lng: -79.5 }; // ~5.6 km away

let db: Db;
let gw: FakeGateway;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('entry-secret');
});

const seed = (deliveryMode: 'file' | 'transfer' = 'file') => seedPaidOrder(db, gw, { deliveryMode, startsAt: STARTS });

describe('confirmationWindowEndsAt', () => {
  it('is the event start plus 12 hours', () => {
    expect(confirmationWindowEndsAt(new Date('2026-12-01T20:00:00Z')).toISOString()).toBe('2026-12-02T08:00:00.000Z');
  });
});

describe('confirmEntry', () => {
  it('inside the venue radius: geoOk true, order ingreso_confirmado, audited with geoOk and photoPath', async () => {
    const { buyer, order } = await seed();
    const photoPath = filePath('proof', buyer.id);
    const res = await confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath }, at(HOUR));

    expect(res).toEqual({ geoOk: true });
    expect((await getOrder(db, order.id)).state).toBe('ingreso_confirmado');
    const audits = (await auditOf(db, order.id)).filter((a) => a.action === 'order.entry_confirmed');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: buyer.id,
      detail: { geoOk: true, photoPath, from: 'entrada_recibida', to: 'ingreso_confirmado', event: 'ENTRY_CONFIRMED' },
    });
  });

  it('outside the radius does not block: geoOk false and the order still advances', async () => {
    const { buyer, order } = await seed();
    const photoPath = filePath('proof', buyer.id);
    const res = await confirmEntry(db, buyer.id, order.id, { ...FAR_AWAY, photoPath }, at(HOUR));

    expect(res).toEqual({ geoOk: false });
    expect((await getOrder(db, order.id)).state).toBe('ingreso_confirmado');
    const [a] = (await auditOf(db, order.id)).filter((x) => x.action === 'order.entry_confirmed');
    expect(a.detail).toMatchObject({ geoOk: false, photoPath });
  });

  it('missing or invalid coordinates do not block either (geoOk false)', async () => {
    const { buyer, order } = await seed();
    const res = await confirmEntry(
      db,
      buyer.id,
      order.id,
      { lat: Number.NaN, lng: Number.NaN, photoPath: filePath('proof', buyer.id) },
      at(HOUR),
    );
    expect(res).toEqual({ geoOk: false });
    expect((await getOrder(db, order.id)).state).toBe('ingreso_confirmado');
  });

  it('requires a photo of the scan', async () => {
    const { buyer, order } = await seed();
    await expect(confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath: '' }, at(HOUR))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath: undefined as unknown as string }, at(HOUR)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
  });

  it('rejects a photo path that is not a proof file owned by the buyer', async () => {
    const { buyer, seller, order } = await seed();
    for (const photoPath of [filePath('proof', seller.id), filePath('evidence', buyer.id), 'proofs/p.png']) {
      await expect(confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath }, at(HOUR))).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
  });

  it('is allowed from 3 h before the start until (excluding) the end of the window', async () => {
    const early = await seed();
    await expect(
      confirmEntry(db, early.buyer.id, early.order.id, { ...AT_VENUE, photoPath: filePath('proof', early.buyer.id) }, at(-3 * HOUR - 1)),
    ).rejects.toBeInstanceOf(EntryWindowError);
    await expect(
      confirmEntry(db, early.buyer.id, early.order.id, { ...AT_VENUE, photoPath: filePath('proof', early.buyer.id) }, at(-3 * HOUR)),
    ).resolves.toEqual({ geoOk: true });

    const late = await seed();
    await expect(
      confirmEntry(db, late.buyer.id, late.order.id, { ...AT_VENUE, photoPath: filePath('proof', late.buyer.id) }, at(12 * HOUR)),
    ).rejects.toBeInstanceOf(EntryWindowError);
    expect((await getOrder(db, late.order.id)).state).toBe('entrada_recibida');
    await expect(
      confirmEntry(db, late.buyer.id, late.order.id, { ...AT_VENUE, photoPath: filePath('proof', late.buyer.id) }, at(12 * HOUR - 1)),
    ).resolves.toEqual({ geoOk: true });
  });

  it('only the buyer can confirm (ForbiddenError), and an unknown order is NotFoundError', async () => {
    const { seller, order } = await seed();
    const stranger = await newUser(db);
    for (const u of [seller, stranger]) {
      await expect(
        confirmEntry(db, u.id, order.id, { ...AT_VENUE, photoPath: filePath('proof', u.id) }, at(HOUR)),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');

    await expect(
      confirmEntry(db, stranger.id, '00000000-0000-4000-8000-000000000000', { ...AT_VENUE, photoPath: filePath('proof', stranger.id) }, at(HOUR)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      confirmEntry(db, stranger.id, 'not-a-uuid', { ...AT_VENUE, photoPath: filePath('proof', stranger.id) }, at(HOUR)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('only from entrada_recibida: a pending transfer or a second confirmation is rejected', async () => {
    const pending = await seed('transfer');
    await expect(
      confirmEntry(db, pending.buyer.id, pending.order.id, { ...AT_VENUE, photoPath: filePath('proof', pending.buyer.id) }, at(HOUR)),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await getOrder(db, pending.order.id)).state).toBe('transferencia_pendiente');

    const { buyer, order } = await seed();
    await confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath: filePath('proof', buyer.id) }, at(HOUR));
    await expect(
      confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath: filePath('proof', buyer.id) }, at(HOUR)),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('two concurrent confirmations: exactly one succeeds and one audit row is written', async () => {
    const { buyer, order } = await seed();
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => confirmEntry(db, buyer.id, order.id, { ...AT_VENUE, photoPath: filePath('proof', buyer.id) }, at(HOUR))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(InvalidTransitionError);
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'order.entry_confirmed')).toHaveLength(1);
  });
});
