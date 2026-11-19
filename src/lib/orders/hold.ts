import { and, eq, lt, notInArray, sql, type SQL } from 'drizzle-orm';
import { listings, orders } from '@/lib/db/schema';

/** An unpaid checkout holds its listing for this long; after that a new checkout may take it over. */
export const CHECKOUT_TTL_MS = 15 * 60 * 1000;

/**
 * True when a live order holds the listing, so startCheckout would refuse it: any order that is
 * not cancelled or refunded (the `orders_live_listing_uq` index), except an unpaid checkout older
 * than CHECKOUT_TTL_MS, which startCheckout abandons and replaces.
 */
export function listingHeld(now: Date): SQL {
  const cutoff = new Date(now.getTime() - CHECKOUT_TTL_MS);
  return sql`exists (${sql`select 1 from ${orders} where ${and(
    eq(orders.listingId, listings.id),
    notInArray(orders.state, ['cancelada', 'reembolsada']),
    sql`not (${and(eq(orders.state, 'creada'), lt(orders.createdAt, cutoff))})`,
  )}`})`;
}
