import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { appConfig, auditLog, disputes, events, listings, orders, users } from '@/lib/db/schema';
import type { Db, Tx } from '@/lib/db/types';
import { openDispute } from '@/lib/disputes/disputes';
import { confirmEntry } from '@/lib/entry/confirmation';
import {
  DAY,
  HOUR,
  MIN,
  auditOf,
  disputesOf,
  filePath,
  getOrder,
  ledgerOf,
  seedPaidOrder,
} from '@/lib/orders/paid-order-fixture';
import { startCheckout } from '@/lib/orders/service';
import type { OrderRow } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { seedListing } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { runMaintenance, type MaintenanceResult } from './maintenance';

const STARTS = new Date('2026-12-01T20:00:00Z');
const at = (msFromStart: number) => new Date(STARTS.getTime() + msFromStart);
const WINDOW_END = at(12 * HOUR);
const PAID_AT = new Date(STARTS.getTime() - DAY);
const DEADLINE = new Date(PAID_AT.getTime() + 2 * HOUR);

const ZERO: MaintenanceResult = { expiredTransfers: 0, released: 0, abandoned: 0, purgedIdentities: 0, failed: 0 };

let db: Db;
let gw: FakeGateway;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('maintenance-secret');
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const seedFile = () => seedPaidOrder(db, gw, { deliveryMode: 'file', startsAt: STARTS, paidAt: PAID_AT });
const seedTransfer = () => seedPaidOrder(db, gw, { deliveryMode: 'transfer', startsAt: STARTS, paidAt: PAID_AT });
const sale = (kind: string) => [kind, kind === 'charge' ? 5000 : kind === 'fee' ? -500 : 4500];

describe('runMaintenance: unpaid checkouts', () => {
  it('abandons creada orders older than 15 minutes', async () => {
    const t0 = new Date();
    const { buyer, listing } = await seedListing(db);
    const { orderId } = await startCheckout(db, gw, buyer.id, listing.id, t0);
    expect(await runMaintenance(db, { gw }, new Date(t0.getTime() + 16 * MIN))).toEqual({ ...ZERO, abandoned: 1 });
    expect((await getOrder(db, orderId)).state).toBe('cancelada');
    expect(await runMaintenance(db, { gw }, new Date(t0.getTime() + 16 * MIN))).toEqual(ZERO);
  });
});

describe('runMaintenance: expired transfers', () => {
  it('refunds a transfer not confirmed by its deadline, exactly once', async () => {
    const { order } = await seedTransfer();
    expect(order.transferDeadline?.toISOString()).toBe(DEADLINE.toISOString());

    expect(await runMaintenance(db, { gw }, DEADLINE)).toEqual(ZERO);
    expect(await runMaintenance(db, { gw }, new Date(DEADLINE.getTime() + 1))).toEqual({ ...ZERO, expiredTransfers: 1 });
    expect(await runMaintenance(db, { gw }, new Date(DEADLINE.getTime() + 2))).toEqual(ZERO);

    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect(gw.refunds).toEqual([
      { providerRef: `fake_${order.id}`, amountCents: 5000, refundRef: `fake_refund_fake_${order.id}` },
    ]);
    expect((await ledgerOf(db, order.id)).map((e) => [e.kind, e.amountCents]).sort()).toEqual(
      [sale('charge'), sale('fee'), sale('seller_due'), ['refund', -5000]].sort(),
    );
    const audits = await auditOf(db, order.id);
    expect(audits.filter((a) => a.action === 'order.transfer_expired')).toEqual([
      expect.objectContaining({
        actorId: null,
        detail: expect.objectContaining({ from: 'transferencia_pendiente', to: 'reembolsada', event: 'TRANSFER_EXPIRED' }),
      }),
    ]);
    expect(audits.filter((a) => a.action === 'order.refunded')).toHaveLength(1);
  });

  it('refunds a pending transfer once the event has started, even without a deadline', async () => {
    const { order } = await seedTransfer();
    await db.update(orders).set({ transferDeadline: null }).where(eq(orders.id, order.id));
    expect(await runMaintenance(db, { gw }, new Date(STARTS.getTime() - 1))).toEqual(ZERO);
    expect(await runMaintenance(db, { gw }, STARTS)).toEqual({ ...ZERO, expiredTransfers: 1 });
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect(gw.refunds).toHaveLength(1);
  });

  it('a failing refund leaves that order untouched, counts a failure, and the run continues', async () => {
    const first = await seedTransfer();
    const second = await seedTransfer();
    const flaky = new FakeGateway('maintenance-secret');
    const realRefund = flaky.refund.bind(flaky);
    flaky.refund = async (providerRef, amountCents) => {
      if (providerRef === first.order.providerRef) throw new Error(`gateway down for ${providerRef}`);
      return realRefund(providerRef, amountCents);
    };
    const later = new Date(DEADLINE.getTime() + MIN);
    expect(await runMaintenance(db, { gw: flaky }, later)).toEqual({ ...ZERO, expiredTransfers: 1, failed: 1 });
    expect((await getOrder(db, first.order.id)).state).toBe('transferencia_pendiente');
    expect(await ledgerOf(db, first.order.id)).toHaveLength(3);
    expect((await getOrder(db, second.order.id)).state).toBe('reembolsada');
    // Logs carry the error name only: no message, ids or references.
    expect(JSON.stringify(errors.mock.calls)).not.toContain(first.order.id);
    expect(JSON.stringify(errors.mock.calls)).toContain('Error');

    expect(await runMaintenance(db, { gw }, later)).toEqual({ ...ZERO, expiredTransfers: 1 });
    expect((await getOrder(db, first.order.id)).state).toBe('reembolsada');
  });
});

describe('runMaintenance: release when the window ends', () => {
  it('releases entrada_recibida and ingreso_confirmado orders at window end, calling onReleased once each', async () => {
    const received = await seedFile();
    const confirmed = await seedFile();
    await confirmEntry(
      db,
      confirmed.buyer.id,
      confirmed.order.id,
      { lat: 9, lng: -79.5, photoPath: filePath('proof', confirmed.buyer.id) },
      at(HOUR),
    );
    const onReleased = vi.fn(async (_tx: Tx, _o: OrderRow) => {});

    expect(await runMaintenance(db, { gw, onReleased }, new Date(WINDOW_END.getTime() - 1))).toEqual(ZERO);
    expect(await runMaintenance(db, { gw, onReleased }, WINDOW_END)).toEqual({ ...ZERO, released: 2 });
    expect(await runMaintenance(db, { gw, onReleased }, new Date(WINDOW_END.getTime() + HOUR))).toEqual(ZERO);

    expect(onReleased).toHaveBeenCalledTimes(2);
    expect(onReleased.mock.calls.map((c) => [c[1].id, c[1].state]).sort()).toEqual(
      [
        [received.order.id, 'liberada'],
        [confirmed.order.id, 'liberada'],
      ].sort(),
    );
    for (const { order } of [received, confirmed]) {
      expect((await getOrder(db, order.id)).state).toBe('liberada');
      expect(await ledgerOf(db, order.id)).toHaveLength(3);
      expect((await auditOf(db, order.id)).filter((a) => a.action === 'order.released')).toEqual([
        expect.objectContaining({ actorId: null, detail: expect.objectContaining({ to: 'liberada', event: 'WINDOW_ELAPSED' }) }),
      ]);
    }
    expect(gw.refunds).toHaveLength(0);
  });

  it('onReleased runs inside the release transaction', async () => {
    const { order } = await seedFile();
    const seen: unknown[] = [];
    await runMaintenance(
      db,
      {
        gw,
        onReleased: async (tx, o) => {
          const [row] = await tx.select().from(orders).where(eq(orders.id, o.id));
          const audit = await tx
            .select()
            .from(auditLog)
            .where(and(eq(auditLog.entityId, o.id), eq(auditLog.action, 'order.released')));
          seen.push(row.state, audit.length);
        },
      },
      WINDOW_END,
    );
    expect(seen).toEqual(['liberada', 1]);
    expect((await getOrder(db, order.id)).state).toBe('liberada');
  });

  it('a throwing onReleased rolls back only that release, and the run continues', async () => {
    const bad = await seedFile();
    const good = await seedFile();
    const onReleased = vi.fn(async (_tx: Tx, o: OrderRow) => {
      if (o.id === bad.order.id) throw new TypeError(`payout failed for ${o.id}`);
    });
    expect(await runMaintenance(db, { gw, onReleased }, WINDOW_END)).toEqual({ ...ZERO, released: 1, failed: 1 });
    expect((await getOrder(db, bad.order.id)).state).toBe('entrada_recibida');
    expect((await auditOf(db, bad.order.id)).filter((a) => a.action === 'order.released')).toHaveLength(0);
    expect((await getOrder(db, good.order.id)).state).toBe('liberada');
    expect(JSON.stringify(errors.mock.calls)).toContain('TypeError');
    expect(JSON.stringify(errors.mock.calls)).not.toContain(bad.order.id);

    // Retried on the next run once the hook works.
    expect(await runMaintenance(db, { gw, onReleased: async () => {} }, WINDOW_END)).toEqual({ ...ZERO, released: 1 });
    expect((await getOrder(db, bad.order.id)).state).toBe('liberada');
  });

  it('skips orders with an open dispute, a cancelled event, or flagged for manual review', async () => {
    const disputed = await seedFile();
    await openDispute(db, disputed.buyer.id, disputed.order.id, 'No entré', [], at(HOUR));
    // Inconsistent on purpose: an open dispute row while the order is still entrada_recibida.
    const openRow = await seedFile();
    await db.insert(disputes).values({ orderId: openRow.order.id, openedBy: openRow.buyer.id, reason: 'x' });
    const cancelled = await seedFile();
    await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, cancelled.event.id));
    const flagged = await seedFile();
    await db.update(orders).set({ needsManualReview: true }).where(eq(orders.id, flagged.order.id));
    const onReleased = vi.fn(async () => {});

    expect(await runMaintenance(db, { gw, onReleased }, at(13 * HOUR))).toEqual(ZERO);
    expect(onReleased).not.toHaveBeenCalled();
    expect((await getOrder(db, disputed.order.id)).state).toBe('disputada');
    for (const { order } of [openRow, cancelled, flagged]) {
      expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
    }
  });
});

describe('runMaintenance: concurrency with disputes', () => {
  it('a dispute racing the release ends in exactly one coherent state (disputada XOR liberada)', async () => {
    for (const maintenanceFirst of [false, true]) {
      const { buyer, order } = await seedFile();
      const onReleased = vi.fn(async () => {});
      const dispute = () => openDispute(db, buyer.id, order.id, 'No me dejaron entrar', [], new Date(WINDOW_END.getTime() - 1));
      const maintenance = () => runMaintenance(db, { gw, onReleased }, WINDOW_END);
      const [d, m] = maintenanceFirst
        ? await Promise.allSettled([maintenance(), dispute()]).then(([a, b]) => [b, a] as const)
        : await Promise.allSettled([dispute(), maintenance()]);

      expect(m.status === 'fulfilled' && m.value.failed).toBe(0);
      const state = (await getOrder(db, order.id)).state;
      const rows = await disputesOf(db, order.id);
      const audits = (await auditOf(db, order.id)).map((a) => a.action);
      if (state === 'disputada') {
        expect(d.status).toBe('fulfilled');
        expect(rows).toHaveLength(1);
        expect(onReleased).not.toHaveBeenCalled();
        expect(audits).not.toContain('order.released');
      } else {
        expect(state).toBe('liberada');
        expect(d.status === 'rejected' && d.reason).toBeInstanceOf(InvalidTransitionError);
        expect(rows).toHaveLength(0);
        expect(onReleased).toHaveBeenCalledTimes(1);
        expect(audits).not.toContain('dispute.opened');
      }
      expect(gw.refunds).toHaveLength(0);
      expect((await ledgerOf(db, order.id)).map((e) => e.kind).sort()).toEqual(['charge', 'fee', 'seller_due']);
    }
  });

  it('a dispute requested while the release holds the lock waits, then fails; no orphan rows', async () => {
    const { buyer, order } = await seedFile();
    let pending: Promise<unknown> | undefined;
    const result = await runMaintenance(
      db,
      {
        gw,
        onReleased: async () => {
          // Not awaited: it must wait for the release transaction to commit.
          pending = openDispute(db, buyer.id, order.id, 'Llegué tarde', [], new Date(WINDOW_END.getTime() - 1));
          pending.catch(() => {});
        },
      },
      WINDOW_END,
    );
    expect(result).toEqual({ ...ZERO, released: 1 });
    await expect(pending).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await getOrder(db, order.id)).state).toBe('liberada');
    expect(await disputesOf(db, order.id)).toHaveLength(0);
    expect((await auditOf(db, order.id)).map((a) => a.action)).not.toContain('dispute.opened');
  });

  it('an order disputed after the candidate scan is re-checked under the lock and skipped cleanly', async () => {
    const a = await seedFile();
    const b = await seedFile();
    const byId = new Map([a, b].map((x) => [x.order.id, x]));
    let pending: Promise<unknown> | undefined;
    const onReleased = vi.fn(async (_tx: Tx, o: OrderRow) => {
      // Both orders were already selected as candidates; dispute the one not yet processed.
      const other = [...byId.values()].find((x) => x.order.id !== o.id)!;
      pending ??= openDispute(db, other.buyer.id, other.order.id, 'No entré', [], new Date(WINDOW_END.getTime() - 1));
    });
    expect(await runMaintenance(db, { gw, onReleased }, WINDOW_END)).toEqual({ ...ZERO, released: 1 });
    await expect(pending).resolves.toBeDefined();
    expect(onReleased).toHaveBeenCalledTimes(1);
    const states = await Promise.all([a, b].map(async (x) => (await getOrder(db, x.order.id)).state));
    expect(states.sort()).toEqual(['disputada', 'liberada']);
  });

  it('a transfer disputed after the candidate scan is not refunded by the expiry run', async () => {
    const a = await seedTransfer();
    const b = await seedTransfer();
    const byRef = new Map([a, b].map((x) => [x.order.providerRef!, x]));
    let pending: Promise<unknown> | undefined;
    const hooked = new FakeGateway('maintenance-secret');
    const realRefund = hooked.refund.bind(hooked);
    hooked.refund = async (providerRef, amountCents) => {
      const other = [...byRef.values()].find((x) => x.order.providerRef !== providerRef)!;
      pending ??= openDispute(db, other.buyer.id, other.order.id, 'No me transfirió', [], new Date(DEADLINE.getTime() + 1));
      return realRefund(providerRef, amountCents);
    };
    expect(await runMaintenance(db, { gw: hooked }, new Date(DEADLINE.getTime() + 1))).toEqual({
      ...ZERO,
      expiredTransfers: 1,
    });
    await expect(pending).resolves.toBeDefined();
    expect(hooked.refunds).toHaveLength(1);
    const states = await Promise.all([a, b].map(async (x) => (await getOrder(db, x.order.id)).state));
    expect(states.sort()).toEqual(['disputada', 'reembolsada']);
  });

  it('a dispute racing a transfer expiry: disputada XOR reembolsada, never a double refund', async () => {
    for (const maintenanceFirst of [false, true]) {
      const { buyer, order } = await seedTransfer();
      const dispute = () => openDispute(db, buyer.id, order.id, 'No me transfirió', [], new Date(DEADLINE.getTime() + 1));
      const maintenance = () => runMaintenance(db, { gw }, new Date(DEADLINE.getTime() + 1));
      if (maintenanceFirst) await Promise.allSettled([maintenance(), dispute()]);
      else await Promise.allSettled([dispute(), maintenance()]);

      const state = (await getOrder(db, order.id)).state;
      const refunds = (await ledgerOf(db, order.id)).filter((e) => e.kind === 'refund');
      const mine = gw.refunds.filter((r) => r.providerRef === order.providerRef);
      if (state === 'disputada') {
        expect(await disputesOf(db, order.id)).toHaveLength(1);
        expect(refunds).toHaveLength(0);
        expect(mine).toHaveLength(0);
      } else {
        expect(state).toBe('reembolsada');
        expect(await disputesOf(db, order.id)).toHaveLength(0);
        expect(refunds).toHaveLength(1);
        expect(mine).toHaveLength(1);
      }
    }
  });

  it('a dispute requested while the expiry refund is in flight fails after the refund commits', async () => {
    const { buyer, order } = await seedTransfer();
    let pending: Promise<unknown> | undefined;
    const slow = new FakeGateway('maintenance-secret');
    const realRefund = slow.refund.bind(slow);
    slow.refund = async (providerRef, amountCents) => {
      pending = openDispute(db, buyer.id, order.id, 'No me transfirió', [], new Date(DEADLINE.getTime() + 1));
      pending.catch(() => {});
      return realRefund(providerRef, amountCents);
    };
    expect(await runMaintenance(db, { gw: slow }, new Date(DEADLINE.getTime() + 1))).toEqual({
      ...ZERO,
      expiredTransfers: 1,
    });
    await expect(pending).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect(slow.refunds).toHaveLength(1);
    expect(await disputesOf(db, order.id)).toHaveLength(0);
  });
});

describe('runMaintenance: identity retention (SEG-11)', () => {
  const NOW = new Date('2030-01-01T00:00:00Z');
  const CUTOFF = new Date(NOW.getTime() - 365 * DAY);
  const LONG_AGO = new Date('2024-01-01T00:00:00Z');
  let seq = 0;
  const phone = () => `+5077${String(++seq).padStart(7, '0')}`;

  async function identityUser(status: 'approved' | 'rejected' | 'pending', createdAt = LONG_AGO) {
    const id = randomUUID();
    const [u] = await db
      .insert(users)
      .values({
        id,
        phone: phone(),
        identityStatus: status,
        idDocPath: `identity/${id}/${randomUUID()}`,
        selfiePath: `selfie/${id}/${randomUUID()}`,
        createdAt,
      })
      .returning();
    return u;
  }

  async function orderBetween(
    buyerId: string,
    sellerId: string,
    o: { state: OrderRow['state']; createdAt: Date; listingStatus?: 'sold' | 'verified' },
  ) {
    const [event] = await db
      .insert(events)
      .values({ name: 'E', venue: 'V', lat: 9, lng: -79.5, radiusM: 500, startsAt: LONG_AGO, faceValueCents: 5000 })
      .returning();
    const [listing] = await db
      .insert(listings)
      .values({
        sellerId,
        eventId: event.id,
        askCents: 5000,
        deliveryMode: 'file',
        status: o.listingStatus ?? 'sold',
        fingerprint: `fp-${randomUUID()}`,
        proofPath: 'p',
        createdAt: LONG_AGO,
      })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({ listingId: listing.id, buyerId, state: o.state, priceCents: 5000, feeCents: 500, createdAt: o.createdAt })
      .returning();
    return order;
  }

  const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

  it('purges approved/rejected users (buyer or seller) whose last order activity is past retention; idempotent', async () => {
    const buyer = await identityUser('approved');
    const seller = await identityUser('rejected');
    await orderBetween(buyer.id, seller.id, { state: 'liquidada', createdAt: new Date(CUTOFF.getTime() - 1) });
    const pending = await identityUser('pending');
    const deleteBlob = vi.fn(async (_p: string) => {});

    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual({ ...ZERO, purgedIdentities: 2 });
    expect(deleteBlob.mock.calls.map((c) => c[0]).sort()).toEqual(
      [buyer.idDocPath, buyer.selfiePath, seller.idDocPath, seller.selfiePath].sort(),
    );
    for (const u of [buyer, seller]) {
      expect(await userRow(u.id)).toMatchObject({ idDocPath: null, selfiePath: null, identityStatus: u.identityStatus });
      const rows = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityId, u.id), eq(auditLog.action, 'identity.purged')));
      expect(rows).toEqual([expect.objectContaining({ actorId: null, entity: 'user' })]);
      expect(JSON.stringify(rows[0].detail)).not.toContain(u.idDocPath!);
    }
    expect(await userRow(pending.id)).toMatchObject({ idDocPath: pending.idDocPath, selfiePath: pending.selfiePath });

    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual(ZERO);
    expect(deleteBlob).toHaveBeenCalledTimes(4);
  });

  it('boundary: activity exactly retentionDays ago is kept, one millisecond older is purged', async () => {
    const seller = await identityUser('approved');
    const kept = await identityUser('approved');
    const purged = await identityUser('approved');
    const keptByAudit = await identityUser('approved');
    await orderBetween(kept.id, seller.id, { state: 'reembolsada', createdAt: CUTOFF });
    await orderBetween(purged.id, seller.id, { state: 'reembolsada', createdAt: new Date(CUTOFF.getTime() - 1) });
    // An old order whose last state change (audit row) is exactly at the cutoff counts as recent.
    const touched = await orderBetween(keptByAudit.id, seller.id, { state: 'cancelada', createdAt: LONG_AGO });
    await db
      .insert(auditLog)
      .values({ actorId: null, action: 'order.x', entity: 'order', entityId: touched.id, createdAt: CUTOFF });

    const deleteBlob = vi.fn(async (_p: string) => {});
    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1 });
    expect((await userRow(purged.id)).idDocPath).toBeNull();
    for (const u of [seller, kept, keptByAudit]) expect((await userRow(u.id)).idDocPath).toBe(u.idDocPath);
  });

  it('never purges a user with a non-final order, an open dispute or an active listing', async () => {
    const old = new Date(CUTOFF.getTime() - 30 * DAY);
    const other = await identityUser('pending');
    const liveBuyer = await identityUser('approved');
    await orderBetween(liveBuyer.id, other.id, { state: 'liberada', createdAt: old });
    const liveSeller = await identityUser('approved');
    await orderBetween(other.id, liveSeller.id, { state: 'disputada', createdAt: old });
    const disputer = await identityUser('approved');
    const refunded = await orderBetween(disputer.id, other.id, { state: 'reembolsada', createdAt: old });
    await db.insert(disputes).values({ orderId: refunded.id, openedBy: disputer.id, reason: 'x', createdAt: old });
    const lister = await identityUser('approved');
    await orderBetween(other.id, lister.id, { state: 'liquidada', createdAt: old, listingStatus: 'verified' });

    const deleteBlob = vi.fn(async (_p: string) => {});
    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual(ZERO);
    expect(deleteBlob).not.toHaveBeenCalled();
    for (const u of [liveBuyer, liveSeller, disputer, lister]) expect((await userRow(u.id)).idDocPath).toBe(u.idDocPath);
  });

  it('a recent identity submission or review restarts the clock for users without orders', async () => {
    const reviewed = await identityUser('approved');
    await db.insert(auditLog).values({
      actorId: null,
      action: 'identity.review',
      entity: 'user',
      entityId: reviewed.id,
      createdAt: new Date(NOW.getTime() - 10 * DAY),
    });
    const stale = await identityUser('rejected');
    await db.insert(auditLog).values({
      actorId: stale.id,
      action: 'identity.submit',
      entity: 'user',
      entityId: stale.id,
      createdAt: new Date(CUTOFF.getTime() - 1),
    });
    const fresh = await identityUser('approved', new Date(NOW.getTime() - DAY));

    expect(await runMaintenance(db, { gw, deleteBlob: async () => {} }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1 });
    expect((await userRow(stale.id)).idDocPath).toBeNull();
    expect((await userRow(reviewed.id)).idDocPath).toBe(reviewed.idDocPath);
    expect((await userRow(fresh.id)).idDocPath).toBe(fresh.idDocPath);
  });

  it('reads identityRetentionDays from app_config', async () => {
    await db.insert(appConfig).values({ key: 'identityRetentionDays', value: '30' });
    const seller = await identityUser('pending');
    const older = await identityUser('approved');
    const newer = await identityUser('approved');
    await orderBetween(older.id, seller.id, { state: 'cancelada', createdAt: new Date(NOW.getTime() - 31 * DAY) });
    await orderBetween(newer.id, seller.id, { state: 'cancelada', createdAt: new Date(NOW.getTime() - 29 * DAY) });

    expect(await runMaintenance(db, { gw, deleteBlob: async () => {} }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1 });
    expect((await userRow(older.id)).idDocPath).toBeNull();
    expect((await userRow(newer.id)).idDocPath).toBe(newer.idDocPath);
  });

  it.each(['abc', '0', '-5', '1.5', ''])('an invalid identityRetentionDays (%j) purges nothing and counts a failure', async (value) => {
    await db.insert(appConfig).values({ key: 'identityRetentionDays', value });
    const u = await identityUser('approved');
    const deleteBlob = vi.fn(async (_p: string) => {});
    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual({ ...ZERO, failed: 1 });
    expect(deleteBlob).not.toHaveBeenCalled();
    expect((await userRow(u.id)).idDocPath).toBe(u.idDocPath);
  });

  it('a failing blob delete keeps that user intact and the run continues', async () => {
    const a = await identityUser('approved');
    const b = await identityUser('rejected');
    const deleteBlob = vi.fn(async (p: string) => {
      if (p === a.selfiePath) throw new Error(`blob store down: ${p}`);
    });
    expect(await runMaintenance(db, { gw, deleteBlob }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1, failed: 1 });
    expect(await userRow(a.id)).toMatchObject({ idDocPath: a.idDocPath, selfiePath: a.selfiePath });
    expect(await userRow(b.id)).toMatchObject({ idDocPath: null, selfiePath: null });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(a.id);

    expect(await runMaintenance(db, { gw, deleteBlob: async () => {} }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1 });
    expect(await userRow(a.id)).toMatchObject({ idDocPath: null, selfiePath: null });
  });

  it('without deleteBlob the paths are still cleared', async () => {
    const u = await identityUser('approved');
    expect(await runMaintenance(db, { gw }, NOW)).toEqual({ ...ZERO, purgedIdentities: 1 });
    expect(await userRow(u.id)).toMatchObject({ idDocPath: null, selfiePath: null });
  });
});

describe('runMaintenance: whole run', () => {
  it('does every job in one pass and a second pass right after is a no-op', async () => {
    const t0 = new Date(WINDOW_END.getTime() - 20 * MIN);
    const stale = await seedListing(db, { startsAt: new Date(WINDOW_END.getTime() + DAY) });
    await startCheckout(db, gw, stale.buyer.id, stale.listing.id, t0);
    const transfer = await seedTransfer();
    const file = await seedFile();
    const id = randomUUID();
    await db.insert(users).values({
      id,
      phone: '+50779999999',
      identityStatus: 'rejected',
      idDocPath: `identity/${id}/${randomUUID()}`,
      selfiePath: `selfie/${id}/${randomUUID()}`,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    const onReleased = vi.fn(async () => {});
    const deleteBlob = vi.fn(async (_p: string) => {});
    const deps = { gw, onReleased, deleteBlob };

    expect(await runMaintenance(db, deps, WINDOW_END)).toEqual({
      expiredTransfers: 1,
      released: 1,
      abandoned: 1,
      purgedIdentities: 1,
      failed: 0,
    });
    expect(await runMaintenance(db, deps, WINDOW_END)).toEqual(ZERO);
    expect((await getOrder(db, transfer.order.id)).state).toBe('reembolsada');
    expect((await getOrder(db, file.order.id)).state).toBe('liberada');
    expect(gw.refunds).toHaveLength(1);
    expect(onReleased).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledTimes(2);
    expect(errors).not.toHaveBeenCalled();
  });
});
