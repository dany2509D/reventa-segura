import type { OrderState } from '@/lib/orders/state-machine';

export type Earnings = { heldCents: number; queuedCents: number; paidCents: number };

type Sale = { state: OrderState; netCents: number; payoutStatus: 'queued' | 'paid' | null };

/** Orders that never paid the seller, or never will. */
const NOT_EARNED: ReadonlySet<OrderState> = new Set<OrderState>(['creada', 'reembolsada', 'cancelada']);

/** The seller's money by stage: still held in escrow, queued for payout, already paid. */
export function sellerEarnings(sales: readonly Sale[]): Earnings {
  const out: Earnings = { heldCents: 0, queuedCents: 0, paidCents: 0 };
  for (const s of sales) {
    if (NOT_EARNED.has(s.state)) continue;
    if (s.payoutStatus === 'paid') out.paidCents += s.netCents;
    else if (s.payoutStatus === 'queued') out.queuedCents += s.netCents;
    else out.heldCents += s.netCents;
  }
  return out;
}
