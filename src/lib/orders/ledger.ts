import { and, eq, inArray, sql } from 'drizzle-orm';
import { ledgerEntries, listings, orders } from '@/lib/db/schema';
import type { Db, Tx } from '@/lib/db/types';
import type { OrderState } from './state-machine';

/**
 * Append-only ledger (a DB trigger rejects UPDATE/DELETE). Amounts are integer cents with fixed signs:
 * charge +price (buyer paid), fee -fee (platform commission), seller_due +net (owed to seller),
 * refund -amount (returned to buyer), payout -amount (paid to seller).
 */
export type LedgerKind = 'charge' | 'fee' | 'seller_due' | 'refund' | 'payout';

export async function appendEntry(
  tx: Tx,
  e: { orderId: string; kind: LedgerKind; amountCents: number; ref: string },
): Promise<void> {
  if (!Number.isSafeInteger(e.amountCents)) {
    throw new RangeError(`amountCents must be an integer, got ${e.amountCents}`);
  }
  if (!e.ref) throw new RangeError('ledger ref is required');
  await tx.insert(ledgerEntries).values(e);
}

/** Paid orders whose seller money is owed but not yet settled (liquidada) nor refunded. */
const PENDING_STATES: OrderState[] = [
  'transferencia_pendiente',
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
];

/** Informational "pendiente de liberar" for a seller: sum of seller_due on pending orders. */
export async function sellerPendingCents(db: Db, sellerId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
    .from(ledgerEntries)
    .innerJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .innerJoin(listings, eq(listings.id, orders.listingId))
    .where(
      and(
        eq(listings.sellerId, sellerId),
        eq(ledgerEntries.kind, 'seller_due'),
        inArray(orders.state, PENDING_STATES),
      ),
    );
  return Number(row.total);
}
