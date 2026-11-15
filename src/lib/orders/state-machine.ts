import type { orders } from '@/lib/db/schema';

/** Mirrors the `orders.state` enum in the schema (a test keeps them in sync). */
export type OrderState = (typeof orders.$inferSelect)['state'];

export const ORDER_STATES = [
  'creada',
  'transferencia_pendiente',
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
  'liquidada',
  'reembolsada',
  'cancelada',
] as const satisfies readonly OrderState[];

export const ORDER_EVENTS = [
  'PAID_TRANSFER',
  'PAID_FILE',
  'TRANSFER_EXPIRED',
  'RECEIVED_CONFIRMED',
  'ENTRY_CONFIRMED',
  'WINDOW_ELAPSED',
  'DISPUTE_OPENED',
  'DISPUTE_REFUND',
  'DISPUTE_RELEASE',
  'EVENT_CANCELLED',
  'PAYOUT_DONE',
  'CHECKOUT_ABANDONED',
] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderState,
    readonly event: OrderEvent,
  ) {
    super(`Invalid order transition: ${from} --${event}-->`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Every allowed transition. Anything missing is invalid.
 * `creada` holds no money; every later state except `cancelada` was reached through a payment,
 * so leaving it for a cancellation means a refund (`reembolsada`), never `cancelada`.
 */
const TRANSITIONS: Record<OrderState, Partial<Record<OrderEvent, OrderState>>> = {
  creada: {
    PAID_TRANSFER: 'transferencia_pendiente',
    PAID_FILE: 'entrada_recibida',
    CHECKOUT_ABANDONED: 'cancelada',
    EVENT_CANCELLED: 'cancelada',
  },
  transferencia_pendiente: {
    RECEIVED_CONFIRMED: 'entrada_recibida',
    TRANSFER_EXPIRED: 'reembolsada',
    DISPUTE_OPENED: 'disputada',
    EVENT_CANCELLED: 'reembolsada',
  },
  entrada_recibida: {
    ENTRY_CONFIRMED: 'ingreso_confirmado',
    WINDOW_ELAPSED: 'liberada',
    DISPUTE_OPENED: 'disputada',
    EVENT_CANCELLED: 'reembolsada',
  },
  ingreso_confirmado: {
    WINDOW_ELAPSED: 'liberada',
    DISPUTE_OPENED: 'disputada',
    EVENT_CANCELLED: 'reembolsada',
  },
  disputada: {
    DISPUTE_REFUND: 'reembolsada',
    DISPUTE_RELEASE: 'liberada',
    EVENT_CANCELLED: 'reembolsada',
  },
  liberada: {
    PAYOUT_DONE: 'liquidada',
    EVENT_CANCELLED: 'reembolsada',
  },
  liquidada: {},
  reembolsada: {},
  cancelada: {},
};

export function transition(state: OrderState, event: OrderEvent): OrderState {
  const next = TRANSITIONS[state]?.[event];
  if (!next) throw new InvalidTransitionError(state, event);
  return next;
}
