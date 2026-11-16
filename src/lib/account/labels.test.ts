import { describe, expect, it } from 'vitest';
import type { OrderState } from '@/lib/orders/state-machine';
import { buyerNextStep, listingStatusLabel, orderStatusLabel, sellerNextStep } from './labels';

const STATES: OrderState[] = [
  'creada',
  'transferencia_pendiente',
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
  'liquidada',
  'reembolsada',
  'cancelada',
];

describe('orderStatusLabel', () => {
  it.each(STATES)('has a distinct, non-empty Spanish label for %s', (s) => {
    expect(orderStatusLabel(s).length).toBeGreaterThan(3);
  });
  it('labels are all different from each other', () => {
    expect(new Set(STATES.map(orderStatusLabel)).size).toBe(STATES.length);
  });
});

describe('buyerNextStep', () => {
  it('transfer order waiting: tells the buyer to look in the ticketing account and upload a capture', () => {
    const s = buyerNextStep({ state: 'transferencia_pendiente', deliveryMode: 'transfer', hasOpenDispute: false });
    expect(s.actions).toContain('upload_received');
    expect(s.actions).toContain('dispute');
    expect(s.text).toMatch(/boletera/i);
  });

  it('file order received: can view the ticket, confirm entry and dispute', () => {
    const s = buyerNextStep({ state: 'entrada_recibida', deliveryMode: 'file', hasOpenDispute: false });
    expect(s.actions).toEqual(expect.arrayContaining(['view_ticket', 'confirm_entry', 'dispute']));
  });

  it('transfer order received: no "view ticket" (the ticket lives in the ticketing app)', () => {
    const s = buyerNextStep({ state: 'entrada_recibida', deliveryMode: 'transfer', hasOpenDispute: false });
    expect(s.actions).not.toContain('view_ticket');
    expect(s.actions).toContain('confirm_entry');
  });

  it('after entry is confirmed the buyer can still dispute until the window closes', () => {
    expect(buyerNextStep({ state: 'ingreso_confirmado', deliveryMode: 'file', hasOpenDispute: false }).actions).toContain('dispute');
  });

  it('with an open dispute no new dispute can be started', () => {
    const s = buyerNextStep({ state: 'disputada', deliveryMode: 'file', hasOpenDispute: true });
    expect(s.actions).not.toContain('dispute');
  });

  it.each(['liberada', 'liquidada', 'reembolsada', 'cancelada', 'creada'] as const)('%s has no buyer actions', (state) => {
    expect(buyerNextStep({ state, deliveryMode: 'file', hasOpenDispute: false }).actions).toEqual([]);
  });

  it('every state has some explanatory text', () => {
    for (const state of STATES) {
      expect(buyerNextStep({ state, deliveryMode: 'transfer', hasOpenDispute: false }).text.length).toBeGreaterThan(10);
    }
  });
});

describe('sellerNextStep', () => {
  it('a paid transfer sale asks the seller to transfer the ticket before the deadline', () => {
    expect(sellerNextStep({ state: 'transferencia_pendiente', deliveryMode: 'transfer', payoutStatus: null })).toMatch(/transfiere la entrada/i);
  });
  it('a released sale says the payout is pending, a paid payout says it was paid', () => {
    expect(sellerNextStep({ state: 'liberada', deliveryMode: 'file', payoutStatus: 'queued' })).toMatch(/pago/i);
    expect(sellerNextStep({ state: 'liquidada', deliveryMode: 'file', payoutStatus: 'paid' })).toMatch(/pagad/i);
  });
  it('every state has some text', () => {
    for (const state of STATES) {
      expect(sellerNextStep({ state, deliveryMode: 'file', payoutStatus: null }).length).toBeGreaterThan(5);
    }
  });
});

describe('listingStatusLabel', () => {
  it.each(['pending', 'verified', 'rejected', 'sold', 'withdrawn'] as const)('%s', (s) => {
    expect(listingStatusLabel(s).length).toBeGreaterThan(3);
  });
});
