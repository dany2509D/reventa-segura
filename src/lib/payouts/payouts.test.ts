import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, disputes, ledgerEntries, orders, payouts, users } from '@/lib/db/schema';
import { makeTestDb } from '@/lib/db/test-db';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { openDispute, resolveDispute } from '@/lib/disputes/disputes';
import { sellerPendingCents } from '@/lib/orders/ledger';
import { getOrder, ledgerOf, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { lockOrderForUpdate, releaseOrder } from '@/lib/orders/settlement';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { PayoutStateError } from './errors';
import { ManualPayoutAdapter, markPayoutPaid, queuePayoutOnRelease } from './payouts';

let db: Db;
const gw = new FakeGateway('payout-gw-secret');
const admin = (o: Partial<Actor> = {}): Actor => ({ userId: randomUUID(), role: 'admin', mfa: true, ...o });

beforeEach(async () => {
  db = await makeTestDb();
});

/** A real paid order (file delivery → entrada_recibida), released through the real settlement path. */
async function releasedOrder(hook: typeof queuePayoutOnRelease | undefined = queuePayoutOnRelease, askCents = 5000) {
  const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file', askCents });
  await db.transaction(async (tx) => {
    const o = await lockOrderForUpdate(tx, fx.order.id);
    await releaseOrder(tx, o!, 'WINDOW_ELAPSED', { action: 'test.release', actorId: null }, hook);
  });
  return fx;
}

const payoutsOf = (orderId: string) => db.select().from(payouts).where(eq(payouts.orderId, orderId));
const payoutEntries = (orderId: string) => ledgerOf(db, orderId).then((rows) => rows.filter((r) => r.kind === 'payout'));

describe('queuePayoutOnRelease', () => {
  it('queues exactly one payout per released order, for the seller net amount', async () => {
    const fx = await releasedOrder();
    const rows = await payoutsOf(fx.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sellerId: fx.seller.id, amountCents: 4500, status: 'queued', bankRef: null, paidAt: null });
    expect((await getOrder(db, fx.order.id)).state).toBe('liberada');
  });

  it('is idempotent: running the hook again for the same order does not create a second payout', async () => {
    const fx = await releasedOrder();
    const o = await getOrder(db, fx.order.id);
    await db.transaction((tx) => queuePayoutOnRelease(tx, o));
    expect(await payoutsOf(fx.order.id)).toHaveLength(1);
  });

  it('refuses to queue a payout for an order that is not liberada', async () => {
    const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file' }); // entrada_recibida
    await expect(db.transaction((tx) => queuePayoutOnRelease(tx, fx.order))).rejects.toBeInstanceOf(PayoutStateError);
    expect(await payoutsOf(fx.order.id)).toHaveLength(0);
  });

  it('a hook failure rolls the release back (order stays entrada_recibida, no payout)', async () => {
    const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    const boom = new Error('hook failed');
    await expect(
      db.transaction(async (tx) => {
        const o = await lockOrderForUpdate(tx, fx.order.id);
        await releaseOrder(tx, o!, 'WINDOW_ELAPSED', { action: 'test.release', actorId: null }, async () => {
          throw boom;
        });
      }),
    ).rejects.toBe(boom);
    expect((await getOrder(db, fx.order.id)).state).toBe('entrada_recibida');
    expect(await payoutsOf(fx.order.id)).toHaveLength(0);
  });

  it('a one-cent sale has zero seller net: no payout row, an audit row explains why', async () => {
    const fx = await releasedOrder(queuePayoutOnRelease, 1);
    expect(await payoutsOf(fx.order.id)).toHaveLength(0);
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, fx.order.id));
    expect(rows.map((r) => r.action)).toContain('payout.skipped_zero_amount');
  });

  it('the database allows only one payout row per order', async () => {
    const fx = await releasedOrder();
    await expect(
      db.insert(payouts).values({ orderId: fx.order.id, sellerId: fx.seller.id, amountCents: 1 }),
    ).rejects.toThrow();
  });
});

describe('ManualPayoutAdapter', () => {
  it('returns the id of the queued payout, and the same id when asked twice', async () => {
    const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    const adapter = new ManualPayoutAdapter();
    const input = { orderId: fx.order.id, sellerId: fx.seller.id, amountCents: 4500 };
    const a = await db.transaction((tx) => adapter.requestPayout(tx, input));
    const b = await db.transaction((tx) => adapter.requestPayout(tx, input));
    expect(a.payoutId).toBe(b.payoutId);
    expect(await payoutsOf(fx.order.id)).toHaveLength(1);
  });
});

describe('markPayoutPaid', () => {
  it('rejects a non-admin and an admin without 2FA before touching anything', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    for (const actor of [admin({ role: 'user' }), admin({ mfa: false })]) {
      await expect(markPayoutPaid(db, actor, p.id, 'BG-123')).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await payoutsOf(fx.order.id))[0].status).toBe('queued');
    expect(await payoutEntries(fx.order.id)).toHaveLength(0);
  });

  it('rejects an admin paying out a payout of their own listing (separation of duties)', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    await expect(markPayoutPaid(db, admin({ userId: fx.seller.id }), p.id, 'BG-123')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await payoutsOf(fx.order.id))[0].status).toBe('queued');
  });

  it('rejects a blank, whitespace or over-long bank reference and a non-uuid payout id', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    for (const ref of ['', '   ', 'x'.repeat(101)]) {
      await expect(markPayoutPaid(db, admin(), p.id, ref)).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(markPayoutPaid(db, admin(), 'not-a-uuid', 'BG-1')).rejects.toBeInstanceOf(ValidationError);
    expect((await payoutsOf(fx.order.id))[0].status).toBe('queued');
  });

  it('pays: payout paid with ref and date, order liquidada, ledger -amount, audit by the admin, pending drops to 0', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    const actor = admin();
    expect(await sellerPendingCents(db, fx.seller.id)).toBe(4500);

    await markPayoutPaid(db, actor, p.id, '  BG-2026-0001  ');

    const [after] = await payoutsOf(fx.order.id);
    expect(after).toMatchObject({ status: 'paid', bankRef: 'BG-2026-0001' });
    expect(after.paidAt).toBeInstanceOf(Date);
    expect((await getOrder(db, fx.order.id)).state).toBe('liquidada');
    const entries = await payoutEntries(fx.order.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ amountCents: -4500, ref: 'BG-2026-0001' });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'payout.paid'));
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(actor.userId);
    expect(await sellerPendingCents(db, fx.seller.id)).toBe(0);
  });

  it('paying the same payout twice fails and writes no second ledger entry', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    await markPayoutPaid(db, admin(), p.id, 'BG-1');
    await expect(markPayoutPaid(db, admin(), p.id, 'BG-1')).rejects.toBeInstanceOf(PayoutStateError);
    expect(await payoutEntries(fx.order.id)).toHaveLength(1);
  });

  it('two admins paying the same payout at once: exactly one wins, one ledger entry', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    const results = await Promise.allSettled([
      markPayoutPaid(db, admin(), p.id, 'BG-A'),
      markPayoutPaid(db, admin(), p.id, 'BG-B'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await payoutEntries(fx.order.id)).toHaveLength(1);
    expect((await getOrder(db, fx.order.id)).state).toBe('liquidada');
  });

  it('never pays out an order that is no longer liberada (refunded after the payout was queued)', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    // e.g. event cancelled after release: the order was refunded but its queued payout row remains
    await db.update(orders).set({ state: 'reembolsada' }).where(eq(orders.id, fx.order.id));

    await expect(markPayoutPaid(db, admin(), p.id, 'BG-1')).rejects.toBeInstanceOf(PayoutStateError);
    expect((await payoutsOf(fx.order.id))[0].status).toBe('queued');
    expect(await payoutEntries(fx.order.id)).toHaveLength(0);
    expect((await getOrder(db, fx.order.id)).state).toBe('reembolsada');
  });

  it('an unknown payout id is a not-found, not a crash', async () => {
    await expect(markPayoutPaid(db, admin(), randomUUID(), 'BG-1')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('the ledger total for a paid-out order nets to the platform fee', async () => {
    const fx = await releasedOrder();
    const [p] = await payoutsOf(fx.order.id);
    await markPayoutPaid(db, admin(), p.id, 'BG-1');
    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, fx.order.id));
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.amountCents]));
    // charge +5000, fee -500, seller_due +4500, payout -4500
    expect(byKind).toMatchObject({ charge: 5000, fee: -500, seller_due: 4500, payout: -4500 });
  });
});

/** disputes.resolved_by references users: a dispute resolver must be a real admin row. */
async function realAdmin(): Promise<Actor> {
  const [u] = await db.insert(users).values({ phone: `+5076${Math.floor(1e7 + Math.random() * 9e6)}`, role: 'admin' }).returning();
  return { userId: u.id, role: 'admin', mfa: true };
}

describe('dispute resolution wiring', () => {
  it("resolving a dispute with 'release' queues the seller payout through the same hook", async () => {
    const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await openDispute(db, fx.buyer.id, fx.order.id, 'El acceso no funcionó', []);
    const [d] = await db.select().from(disputes).where(eq(disputes.orderId, fx.order.id));

    await resolveDispute(db, gw, await realAdmin(), d.id, 'release', new Date(), { onReleased: queuePayoutOnRelease });

    expect((await getOrder(db, fx.order.id)).state).toBe('liberada');
    expect(await payoutsOf(fx.order.id)).toHaveLength(1);
  });

  it("resolving a dispute with 'refund' never queues a payout", async () => {
    const fx = await seedPaidOrder(db, gw, { deliveryMode: 'file' });
    await openDispute(db, fx.buyer.id, fx.order.id, 'Entrada inválida', []);
    const [d] = await db.select().from(disputes).where(eq(disputes.orderId, fx.order.id));

    await resolveDispute(db, gw, await realAdmin(), d.id, 'refund', new Date(), { onReleased: queuePayoutOnRelease });

    expect((await getOrder(db, fx.order.id)).state).toBe('reembolsada');
    expect(await payoutsOf(fx.order.id)).toHaveLength(0);
  });
});
