import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { orders, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { confirmEntry } from '@/lib/entry/confirmation';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  HOUR,
  auditOf,
  disputesOf,
  filePath,
  getOrder,
  ledgerOf,
  seedPaidOrder,
} from '@/lib/orders/paid-order-fixture';
import type { OrderRow } from '@/lib/orders/settlement';
import { InvalidTransitionError } from '@/lib/orders/state-machine';
import { newUser, seedListing } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import {
  DisputeAlreadyOpenError,
  DisputeAlreadyResolvedError,
  DisputeWindowClosedError,
  openDispute,
  resolveDispute,
} from './disputes';

const STARTS = new Date('2026-12-01T20:00:00Z');
const at = (msFromStart: number) => new Date(STARTS.getTime() + msFromStart);
const WINDOW_END = at(12 * HOUR);

let db: Db;
let gw: FakeGateway;
let admin: Actor;
beforeEach(async () => {
  db = await makeTestDb();
  gw = new FakeGateway('dispute-secret');
  const u = await newUser(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, u.id));
  admin = { userId: u.id, role: 'admin', mfa: true };
});

const seed = (deliveryMode: 'file' | 'transfer' = 'file') => seedPaidOrder(db, gw, { deliveryMode, startsAt: STARTS });

async function seedDisputed() {
  const fx = await seedPaidOrder(db, gw, { startsAt: STARTS });
  const { disputeId } = await openDispute(db, fx.buyer.id, fx.order.id, 'No me dejaron entrar', [], at(HOUR));
  return { ...fx, disputeId };
}

describe('openDispute', () => {
  it('opens a dispute: one open row with reason and evidence, order disputada, audited by the buyer', async () => {
    const { buyer, order } = await seed();
    const evidence = [filePath('evidence', buyer.id), filePath('evidence', buyer.id)];
    const { disputeId } = await openDispute(db, buyer.id, order.id, '  La entrada ya fue usada  ', evidence, at(HOUR));

    const rows = await disputesOf(db, order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: disputeId,
      openedBy: buyer.id,
      reason: 'La entrada ya fue usada',
      evidencePaths: evidence,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
    });
    expect(rows[0].createdAt.toISOString()).toBe(at(HOUR).toISOString());
    expect((await getOrder(db, order.id)).state).toBe('disputada');
    const audits = (await auditOf(db, order.id)).filter((a) => a.action === 'dispute.opened');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: buyer.id,
      detail: { disputeId, evidenceCount: 2, from: 'entrada_recibida', to: 'disputada', event: 'DISPUTE_OPENED' },
    });
  });

  it('is allowed from transferencia_pendiente and ingreso_confirmado', async () => {
    const pending = await seed('transfer');
    await openDispute(db, pending.buyer.id, pending.order.id, 'No me transfirió', [], at(-HOUR));
    expect((await getOrder(db, pending.order.id)).state).toBe('disputada');

    const confirmed = await seed();
    await confirmEntry(
      db,
      confirmed.buyer.id,
      confirmed.order.id,
      { lat: 9, lng: -79.5, photoPath: filePath('proof', confirmed.buyer.id) },
      at(HOUR),
    );
    await openDispute(db, confirmed.buyer.id, confirmed.order.id, 'Me sacaron del evento', [], at(2 * HOUR));
    expect((await getOrder(db, confirmed.order.id)).state).toBe('disputada');
  });

  it('after the window closes: DisputeWindowClosedError and nothing is written', async () => {
    const { buyer, order } = await seed();
    for (const now of [WINDOW_END, at(13 * HOUR)]) {
      await expect(openDispute(db, buyer.id, order.id, 'Tarde', [], now)).rejects.toBeInstanceOf(
        DisputeWindowClosedError,
      );
    }
    expect(await disputesOf(db, order.id)).toHaveLength(0);
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
    // One millisecond before the end is still inside the window.
    await openDispute(db, buyer.id, order.id, 'Justo a tiempo', [], new Date(WINDOW_END.getTime() - 1));
    expect((await getOrder(db, order.id)).state).toBe('disputada');
  });

  it('only the buyer can open it (ForbiddenError); an unknown order is NotFoundError', async () => {
    const { seller, order } = await seed();
    const stranger = await newUser(db);
    for (const u of [seller, stranger]) {
      await expect(openDispute(db, u.id, order.id, 'Quiero mi dinero', [], at(HOUR))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    expect(await disputesOf(db, order.id)).toHaveLength(0);
    expect((await getOrder(db, order.id)).state).toBe('entrada_recibida');
    await expect(
      openDispute(db, stranger.id, '00000000-0000-4000-8000-000000000000', 'x', [], at(HOUR)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a second dispute on the same order is rejected (DisputeAlreadyOpenError)', async () => {
    const { buyer, order } = await seed();
    await openDispute(db, buyer.id, order.id, 'Primera', [], at(HOUR));
    await expect(openDispute(db, buyer.id, order.id, 'Segunda', [], at(2 * HOUR))).rejects.toBeInstanceOf(
      DisputeAlreadyOpenError,
    );
    expect(await disputesOf(db, order.id)).toHaveLength(1);
  });

  it('concurrent disputes on the same order: exactly one row and one transition', async () => {
    const { buyer, order } = await seed();
    const results = await Promise.allSettled(
      [1, 2, 3].map((i) => openDispute(db, buyer.id, order.id, `Intento ${i}`, [], at(HOUR))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(DisputeAlreadyOpenError);
    expect(await disputesOf(db, order.id)).toHaveLength(1);
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'dispute.opened')).toHaveLength(1);
  });

  it('validates the reason: required, at most 2000 characters', async () => {
    const { buyer, order } = await seed();
    for (const reason of ['', '   ', 'x'.repeat(2001), undefined as unknown as string]) {
      await expect(openDispute(db, buyer.id, order.id, reason, [], at(HOUR))).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await disputesOf(db, order.id)).toHaveLength(0);
    await openDispute(db, buyer.id, order.id, 'x'.repeat(2000), [], at(HOUR));
    expect((await disputesOf(db, order.id))[0].reason).toHaveLength(2000);
  });

  it('validates evidence: at most 5 distinct evidence files owned by the buyer', async () => {
    const { buyer, seller, order } = await seed();
    const own = () => filePath('evidence', buyer.id);
    const dup = own();
    for (const evidence of [
      [own(), own(), own(), own(), own(), own()],
      [filePath('evidence', seller.id)],
      [filePath('proof', buyer.id)],
      ['evidence/../../etc/passwd'],
      [dup, dup],
      'not-an-array' as unknown as string[],
    ]) {
      await expect(openDispute(db, buyer.id, order.id, 'Motivo', evidence, at(HOUR))).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    expect(await disputesOf(db, order.id)).toHaveLength(0);
    await openDispute(db, buyer.id, order.id, 'Motivo', [own(), own(), own(), own(), own()], at(HOUR));
    expect((await disputesOf(db, order.id))[0].evidencePaths).toHaveLength(5);
  });

  it('is rejected for an unpaid or already settled order', async () => {
    const { buyer, listing } = await seedListing(db, { startsAt: STARTS });
    const [unpaid] = await db
      .insert(orders)
      .values({ listingId: listing.id, buyerId: buyer.id, state: 'creada', priceCents: 5000, feeCents: 500 })
      .returning();
    await expect(openDispute(db, buyer.id, unpaid.id, 'Motivo', [], at(-HOUR))).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );

    const released = await seedDisputed();
    await resolveDispute(db, gw, admin, released.disputeId, 'release', at(2 * HOUR));
    await expect(
      openDispute(db, released.buyer.id, released.order.id, 'Otra vez', [], at(3 * HOUR)),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await disputesOf(db, released.order.id)).toHaveLength(1);
  });
});

describe('resolveDispute', () => {
  it('refund: one gateway refund, a refund ledger entry, order reembolsada, dispute closed and audited', async () => {
    const { order, disputeId } = await seedDisputed();
    await resolveDispute(db, gw, admin, disputeId, 'refund', at(5 * HOUR));

    expect(gw.refunds).toEqual([
      { providerRef: `fake_${order.id}`, amountCents: 5000, refundRef: `fake_refund_fake_${order.id}` },
    ]);
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect((await ledgerOf(db, order.id)).map((e) => [e.kind, e.amountCents, e.ref]).sort()).toEqual(
      [
        ['charge', 5000, `fake_${order.id}`],
        ['fee', -500, `fake_${order.id}`],
        ['seller_due', 4500, `fake_${order.id}`],
        ['refund', -5000, `fake_refund_fake_${order.id}`],
      ].sort(),
    );
    const [d] = await disputesOf(db, order.id);
    expect(d).toMatchObject({ status: 'refunded', resolvedBy: admin.userId });
    expect(d.resolvedAt?.toISOString()).toBe(at(5 * HOUR).toISOString());
    const audits = await auditOf(db, order.id);
    expect(audits.filter((a) => a.action === 'dispute.resolved')).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        detail: expect.objectContaining({ disputeId, decision: 'refund', from: 'disputada', to: 'reembolsada' }),
      }),
    ]);
    expect(audits.filter((a) => a.action === 'order.refunded')).toEqual([
      expect.objectContaining({ actorId: admin.userId, detail: expect.objectContaining({ amountCents: 5000 }) }),
    ]);
  });

  it('release: order liberada, onReleased called once inside the transaction, no refund', async () => {
    const { order, disputeId } = await seedDisputed();
    const seen: string[] = [];
    const onReleased = vi.fn(async (tx: Parameters<Parameters<Db['transaction']>[0]>[0], o: OrderRow) => {
      // Same transaction: the uncommitted state change is visible through `tx`.
      const [row] = await tx.select().from(orders).where(eq(orders.id, o.id));
      seen.push(row.state);
    });
    await resolveDispute(db, gw, admin, disputeId, 'release', at(5 * HOUR), { onReleased });

    expect(onReleased).toHaveBeenCalledTimes(1);
    expect(onReleased.mock.calls[0][1]).toMatchObject({ id: order.id, state: 'liberada', priceCents: 5000 });
    expect(seen).toEqual(['liberada']);
    expect((await getOrder(db, order.id)).state).toBe('liberada');
    expect(gw.refunds).toHaveLength(0);
    expect(await ledgerOf(db, order.id)).toHaveLength(3);
    const [d] = await disputesOf(db, order.id);
    expect(d).toMatchObject({ status: 'released', resolvedBy: admin.userId });
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'dispute.resolved')).toEqual([
      expect.objectContaining({ actorId: admin.userId, detail: expect.objectContaining({ decision: 'release' }) }),
    ]);
  });

  it('a throwing onReleased hook rolls the release back: dispute stays open, order disputada', async () => {
    const { order, disputeId } = await seedDisputed();
    const onReleased = async () => {
      throw new Error('payout queue down');
    };
    await expect(resolveDispute(db, gw, admin, disputeId, 'release', at(5 * HOUR), { onReleased })).rejects.toThrow(
      'payout queue down',
    );
    expect((await getOrder(db, order.id)).state).toBe('disputada');
    expect((await disputesOf(db, order.id))[0].status).toBe('open');
    expect((await auditOf(db, order.id)).filter((a) => a.action === 'dispute.resolved')).toHaveLength(0);
  });

  it('requires an admin with 2FA (ForbiddenError) and changes nothing otherwise', async () => {
    const { order, buyer, disputeId } = await seedDisputed();
    for (const actor of [
      { ...admin, mfa: false },
      { userId: buyer.id, role: 'user' as const, mfa: true },
    ]) {
      await expect(resolveDispute(db, gw, actor, disputeId, 'refund', at(5 * HOUR))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    expect(gw.refunds).toHaveLength(0);
    expect((await getOrder(db, order.id)).state).toBe('disputada');
    expect((await disputesOf(db, order.id))[0].status).toBe('open');
  });

  it('resolving twice is an error and never refunds twice', async () => {
    const { order, disputeId } = await seedDisputed();
    await resolveDispute(db, gw, admin, disputeId, 'refund', at(5 * HOUR));
    for (const decision of ['refund', 'release'] as const) {
      await expect(resolveDispute(db, gw, admin, disputeId, decision, at(6 * HOUR))).rejects.toBeInstanceOf(
        DisputeAlreadyResolvedError,
      );
    }
    expect(gw.refunds).toHaveLength(1);
    expect((await ledgerOf(db, order.id)).filter((e) => e.kind === 'refund')).toHaveLength(1);
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
  });

  it('concurrent refund and release: exactly one wins, at most one refund', async () => {
    const { order, disputeId } = await seedDisputed();
    const onReleased = vi.fn(async () => {});
    const results = await Promise.allSettled([
      resolveDispute(db, gw, admin, disputeId, 'refund', at(5 * HOUR)),
      resolveDispute(db, gw, admin, disputeId, 'release', at(5 * HOUR), { onReleased }),
      resolveDispute(db, gw, admin, disputeId, 'refund', at(5 * HOUR)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(DisputeAlreadyResolvedError);

    const state = (await getOrder(db, order.id)).state;
    const refunds = (await ledgerOf(db, order.id)).filter((e) => e.kind === 'refund');
    if (state === 'reembolsada') {
      expect(gw.refunds).toHaveLength(1);
      expect(refunds).toHaveLength(1);
      expect(onReleased).not.toHaveBeenCalled();
    } else {
      expect(state).toBe('liberada');
      expect(gw.refunds).toHaveLength(0);
      expect(refunds).toHaveLength(0);
      expect(onReleased).toHaveBeenCalledTimes(1);
    }
  });

  it('a failing gateway refund rolls everything back so it can be retried', async () => {
    const { order, disputeId } = await seedDisputed();
    const broken = new FakeGateway('dispute-secret');
    broken.refund = async () => {
      throw new Error('gateway down');
    };
    await expect(resolveDispute(db, broken, admin, disputeId, 'refund', at(5 * HOUR))).rejects.toThrow('gateway down');
    expect((await getOrder(db, order.id)).state).toBe('disputada');
    expect((await disputesOf(db, order.id))[0].status).toBe('open');
    expect(await ledgerOf(db, order.id)).toHaveLength(3);

    await resolveDispute(db, gw, admin, disputeId, 'refund', at(6 * HOUR));
    expect((await getOrder(db, order.id)).state).toBe('reembolsada');
    expect(gw.refunds).toHaveLength(1);
  });

  it('unknown dispute is NotFoundError; an invalid decision is ValidationError', async () => {
    await expect(
      resolveDispute(db, gw, admin, '00000000-0000-4000-8000-000000000000', 'refund', at(5 * HOUR)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveDispute(db, gw, admin, 'nope', 'refund', at(5 * HOUR))).rejects.toBeInstanceOf(NotFoundError);
    const { disputeId } = await seedDisputed();
    await expect(
      resolveDispute(db, gw, admin, disputeId, 'cancel' as unknown as 'refund', at(5 * HOUR)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
