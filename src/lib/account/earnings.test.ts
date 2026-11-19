import { describe, expect, it } from 'vitest';
import { sellerEarnings } from './earnings';

describe('sellerEarnings', () => {
  it('splits net amounts into held, queued for payout and paid', () => {
    expect(
      sellerEarnings([
        { state: 'entrada_recibida', netCents: 4500, payoutStatus: null },
        { state: 'disputada', netCents: 1000, payoutStatus: null },
        { state: 'liberada', netCents: 3000, payoutStatus: 'queued' },
        { state: 'liquidada', netCents: 2000, payoutStatus: 'paid' },
      ]),
    ).toEqual({ heldCents: 5500, queuedCents: 3000, paidCents: 2000 });
  });

  it('ignores unpaid, refunded and cancelled orders', () => {
    expect(
      sellerEarnings([
        { state: 'creada', netCents: 9999, payoutStatus: null },
        { state: 'reembolsada', netCents: 9999, payoutStatus: null },
        { state: 'cancelada', netCents: 9999, payoutStatus: null },
      ]),
    ).toEqual({ heldCents: 0, queuedCents: 0, paidCents: 0 });
  });

  it('is zero for no sales', () => {
    expect(sellerEarnings([])).toEqual({ heldCents: 0, queuedCents: 0, paidCents: 0 });
  });
});
