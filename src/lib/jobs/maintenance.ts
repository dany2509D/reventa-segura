import { and, eq, inArray, isNotNull, isNull, lt, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import { audit } from '@/lib/audit/audit';
import { alert, errorName } from '@/lib/observability/log';
import { appConfig, auditLog, disputes, events, listings, orders, users } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { CONFIRMATION_WINDOW_MS, confirmationWindowEndsAt } from '@/lib/entry/confirmation';
import { abandonStaleCheckouts } from '@/lib/orders/service';
import {
  eventForOrder,
  lockOrderForUpdate,
  refundPaidOrder,
  releaseOrder,
  type EventRow,
  type OnReleased,
  type OrderRow,
} from '@/lib/orders/settlement';
import type { OrderState } from '@/lib/orders/state-machine';
import type { PaymentGateway } from '@/lib/payments/gateway';

const DAY_MS = 24 * 60 * 60 * 1000;

/** app_config key: days identity documents are kept after a user's last activity (SEG-11). */
export const IDENTITY_RETENTION_KEY = 'identityRetentionDays';
/** Placeholder until the lawyer sets the real value. */
export const DEFAULT_IDENTITY_RETENTION_DAYS = 365;

export type MaintenanceDeps = {
  gw: PaymentGateway;
  /** Runs inside each release transaction (Task 10 queues the payout here). */
  onReleased?: OnReleased;
  /** Deletes a private blob; identity paths are cleared even when absent. */
  deleteBlob?: (path: string) => Promise<void>;
};

export type MaintenanceResult = {
  expiredTransfers: number;
  released: number;
  abandoned: number;
  purgedIdentities: number;
  /** Items (or whole steps) that threw; they are retried on the next run. */
  failed: number;
};

export class InvalidConfigError extends Error {
  constructor(readonly key: string) {
    super(`Invalid app_config value for ${key}`);
    this.name = 'InvalidConfigError';
  }
}

const RELEASABLE: readonly OrderState[] = ['entrada_recibida', 'ingreso_confirmado'];
const FINAL_STATES: readonly OrderState[] = ['liquidada', 'reembolsada', 'cancelada'];

/**
 * Periodic job (cron every 10 min). Every order is handled in its own transaction under
 * SELECT ... FOR UPDATE with the state re-checked after the lock, so it can race the buyer's
 * dispute or a second run without double effects; running it twice in a row is a no-op.
 * A failing item is logged (error name only) and counted, and the run goes on.
 */
export async function runMaintenance(db: Db, deps: MaintenanceDeps, now: Date): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { expiredTransfers: 0, released: 0, abandoned: 0, purgedIdentities: 0, failed: 0 };

  const fail = (step: string, e: unknown, itemId?: string) => {
    result.failed++;
    // A failed refund, release or purge needs a person (RNF-10). The error NAME plus the id of the
    // order/identity so the operator knows which one: messages can carry file paths or bound parameters.
    alert('maintenance_step_failed', { step, error: errorName(e), ...(itemId ? { itemId } : {}) });
  };

  const forEach = async (step: string, list: () => Promise<string[]>, run: (id: string) => Promise<boolean>) => {
    let ids: string[];
    try {
      ids = await list();
    } catch (e) {
      fail(step, e);
      return 0;
    }
    let done = 0;
    for (const id of ids) {
      try {
        if (await run(id)) done++;
      } catch (e) {
        fail(step, e, id);
      }
    }
    return done;
  };

  try {
    result.abandoned = await abandonStaleCheckouts(db, now);
  } catch (e) {
    fail('abandon_checkouts', e);
  }

  result.expiredTransfers = await forEach(
    'expire_transfers',
    () => expiredTransferIds(db, now),
    (id) => expireTransfer(db, deps.gw, id, now),
  );

  result.released = await forEach(
    'release',
    () => releasableIds(db, now),
    (id) => releaseIfDue(db, id, now, deps.onReleased),
  );

  let retentionDays: number | undefined;
  try {
    retentionDays = await readRetentionDays(db);
  } catch (e) {
    fail('purge_identities', e); // never delete documents on a misconfiguration
  }
  if (retentionDays !== undefined) {
    const days = retentionDays;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    result.purgedIdentities = await forEach(
      'purge_identities',
      () => purgeCandidateIds(db, cutoff),
      (id) => purgeIdentity(db, id, cutoff, days, deps.deleteBlob),
    );
  }

  return result;
}

// --- Transfers the seller did not complete in time -> full refund ---------------------------------

/**
 * A pending transfer expires when its deadline has passed or the event has started. A missing
 * deadline counts as expired (fail closed), matching confirmReceived, which refuses it too.
 */
function transferExpired(o: OrderRow, ev: EventRow, now: Date): boolean {
  if (o.transferDeadline === null) return true;
  return o.transferDeadline.getTime() < now.getTime() || ev.startsAt.getTime() <= now.getTime();
}

async function expiredTransferIds(db: Db, now: Date): Promise<string[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(
      and(
        eq(orders.state, 'transferencia_pendiente'),
        // Manual (Yappy / ACH) orders hold no captured money: abandonStaleCheckouts cancels them.
        isNull(orders.paymentMethod),
        or(isNull(orders.transferDeadline), lt(orders.transferDeadline, now), lte(events.startsAt, now)),
      ),
    );
  return rows.map((r) => r.id);
}

function expireTransfer(db: Db, gw: PaymentGateway, id: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const o = await lockOrderForUpdate(tx, id);
    if (!o || o.state !== 'transferencia_pendiente' || o.paymentMethod !== null) return false;
    const ev = await eventForOrder(tx, o);
    if (!transferExpired(o, ev, now)) return false;
    await refundPaidOrder(tx, gw, o, 'TRANSFER_EXPIRED', {
      action: 'order.transfer_expired',
      actorId: null,
      detail: {
        transferDeadline: o.transferDeadline?.toISOString() ?? null,
        eventStartsAt: ev.startsAt.toISOString(),
      },
    });
    return true;
  });
}

// --- Confirmation window over with no dispute -> money released to the seller --------------------

async function releasableIds(db: Db, now: Date): Promise<string[]> {
  const startedBy = new Date(now.getTime() - CONFIRMATION_WINDOW_MS); // window end <= now
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .innerJoin(events, eq(events.id, listings.eventId))
    .where(
      and(
        inArray(orders.state, [...RELEASABLE]),
        eq(orders.needsManualReview, false),
        eq(events.status, 'active'),
        lte(events.startsAt, startedBy),
        notExists(
          db
            .select({ one: sql`1` })
            .from(disputes)
            .where(and(eq(disputes.orderId, orders.id), eq(disputes.status, 'open'))),
        ),
      ),
    );
  return rows.map((r) => r.id);
}

function releaseIfDue(db: Db, id: string, now: Date, onReleased?: OnReleased): Promise<boolean> {
  return db.transaction(async (tx) => {
    const o = await lockOrderForUpdate(tx, id);
    if (!o || !RELEASABLE.includes(o.state) || o.needsManualReview) return false;
    const ev = await eventForOrder(tx, o);
    const windowEndsAt = confirmationWindowEndsAt(ev.startsAt);
    if (ev.status !== 'active' || windowEndsAt.getTime() > now.getTime()) return false;
    // openDispute inserts under this same order lock, so this read cannot miss one.
    const [open] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(eq(disputes.orderId, o.id), eq(disputes.status, 'open')))
      .limit(1);
    if (open) return false;
    await releaseOrder(
      tx,
      o,
      'WINDOW_ELAPSED',
      { action: 'order.released', actorId: null, detail: { windowEndsAt: windowEndsAt.toISOString() } },
      onReleased,
    );
    return true;
  });
}

// --- Identity document retention (SEG-11) --------------------------------------------------------

async function readRetentionDays(db: Db): Promise<number> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, IDENTITY_RETENTION_KEY));
  if (!row) return DEFAULT_IDENTITY_RETENTION_DAYS;
  const v = row.value.trim();
  if (!/^[1-9]\d{0,4}$/.test(v)) throw new InvalidConfigError(IDENTITY_RETENTION_KEY);
  return Number(v);
}

/**
 * True while the user's identity documents must be kept: any activity at or after `cutoff`
 * (account creation, a listing, an order created or changing state per audit_log, an identity
 * submission/review), any order still in a non-final state, an active listing, or an open dispute.
 */
function retainedSql(cutoff: Date): SQL {
  const c = sql`${cutoff.toISOString()}::timestamptz`;
  const finalStates = sql.raw(FINAL_STATES.map((s) => `'${s}'`).join(', ')); // constants only
  return sql`(
    ${users.createdAt} >= ${c}
    or exists (
      select 1 from ${listings} ul
      where ul.seller_id = ${users.id} and (ul.created_at >= ${c} or ul.status in ('pending', 'verified'))
    )
    or exists (
      select 1 from ${orders} o join ${listings} ol on ol.id = o.listing_id
      where (o.buyer_id = ${users.id} or ol.seller_id = ${users.id})
        and (
          o.state not in (${finalStates})
          or o.created_at >= ${c}
          or exists (
            select 1 from ${auditLog} oa
            where oa.entity = 'order' and oa.entity_id = o.id::text and oa.created_at >= ${c}
          )
          or exists (select 1 from ${disputes} od where od.order_id = o.id and od.status = 'open')
        )
    )
    or exists (select 1 from ${disputes} ud where ud.opened_by = ${users.id} and ud.status = 'open')
    or exists (
      select 1 from ${auditLog} ua
      where ua.entity = 'user' and ua.entity_id = ${users.id}::text
        and ua.action in ('identity.submit', 'identity.review') and ua.created_at >= ${c}
    )
  )`;
}

async function purgeCandidateIds(db: Db, cutoff: Date): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.identityStatus, ['approved', 'rejected']),
        or(isNotNull(users.idDocPath), isNotNull(users.selfiePath)),
        sql`not ${retainedSql(cutoff)}`,
      ),
    );
  return rows.map((r) => r.id);
}

function purgeIdentity(
  db: Db,
  id: string,
  cutoff: Date,
  retentionDays: number,
  deleteBlob?: (path: string) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!u || (u.identityStatus !== 'approved' && u.identityStatus !== 'rejected')) return false;
    const paths = [u.idDocPath, u.selfiePath].filter((p): p is string => Boolean(p));
    if (paths.length === 0) return false;
    // Re-checked after the lock with a fresh statement (a new order or dispute may have appeared).
    const [check] = await tx
      .select({ keep: sql<boolean>`${retainedSql(cutoff)}` })
      .from(users)
      .where(eq(users.id, id));
    if (!check || check.keep) return false;

    // Blobs go first: if a delete fails the paths stay and the next run retries,
    // rather than leaving unreferenced identity documents in storage.
    if (deleteBlob) for (const p of paths) await deleteBlob(p);
    await tx.update(users).set({ idDocPath: null, selfiePath: null }).where(eq(users.id, id));
    await audit(tx, {
      actorId: null,
      action: 'identity.purged',
      entity: 'user',
      entityId: id,
      detail: { retentionDays, files: paths.length, identityStatus: u.identityStatus },
    });
    return true;
  });
}
