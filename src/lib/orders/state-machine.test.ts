import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  ORDER_EVENTS,
  ORDER_STATES,
  transition,
  type OrderEvent,
  type OrderState,
} from './state-machine';

const valid: [OrderState, OrderEvent, OrderState][] = [
  ['creada', 'PAID_TRANSFER', 'transferencia_pendiente'],
  ['creada', 'PAID_FILE', 'entrada_recibida'],
  ['transferencia_pendiente', 'RECEIVED_CONFIRMED', 'entrada_recibida'],
  ['entrada_recibida', 'ENTRY_CONFIRMED', 'ingreso_confirmado'],
  ['ingreso_confirmado', 'WINDOW_ELAPSED', 'liberada'],
  ['entrada_recibida', 'WINDOW_ELAPSED', 'liberada'],
  ['liberada', 'PAYOUT_DONE', 'liquidada'],
  ['transferencia_pendiente', 'DISPUTE_OPENED', 'disputada'],
  ['entrada_recibida', 'DISPUTE_OPENED', 'disputada'],
  ['ingreso_confirmado', 'DISPUTE_OPENED', 'disputada'],
  ['creada', 'CHECKOUT_ABANDONED', 'cancelada'],
  ['disputada', 'DISPUTE_REFUND', 'reembolsada'],
  ['disputada', 'DISPUTE_RELEASE', 'liberada'],
];

describe('order state machine', () => {
  it.each(valid)('%s --%s--> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it.each([
    ['liquidada', 'DISPUTE_OPENED'],
    ['reembolsada', 'PAYOUT_DONE'],
  ] as [OrderState, OrderEvent][])('%s --%s throws InvalidTransitionError', (from, event) => {
    expect(() => transition(from, event)).toThrow(InvalidTransitionError);
  });

  it('error carries the offending state and event', () => {
    try {
      transition('liquidada', 'DISPUTE_OPENED');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).from).toBe('liquidada');
      expect((e as InvalidTransitionError).event).toBe('DISPUTE_OPENED');
    }
  });

  it('terminal states accept no event', () => {
    for (const terminal of ['liquidada', 'reembolsada', 'cancelada'] as OrderState[]) {
      for (const event of ORDER_EVENTS) {
        expect(() => transition(terminal, event)).toThrow(InvalidTransitionError);
      }
    }
  });

  it('a paid order can never go back to creada or be abandoned', () => {
    for (const from of ORDER_STATES.filter((s) => s !== 'creada')) {
      expect(() => transition(from, 'CHECKOUT_ABANDONED')).toThrow(InvalidTransitionError);
      expect(() => transition(from, 'PAID_TRANSFER')).toThrow(InvalidTransitionError);
      expect(() => transition(from, 'PAID_FILE')).toThrow(InvalidTransitionError);
    }
  });

  it('state list matches the orders.state enum in the schema', async () => {
    const { orders } = await import('@/lib/db/schema');
    expect([...ORDER_STATES].sort()).toEqual([...orders.state.enumValues].sort());
  });
});
