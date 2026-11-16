import type { orders } from '@/lib/db/schema';

/** Mirrors the `orders.state` enum in the schema (a test keeps them in sync). */
export type OrderState = (typeof orders.$inferSelect)['state'];

export const ORDER_STATES = [
  'creada',
  'transferencia_pendiente',
  'comprobante_en_revision',
  'entrada_recibida',
  'ingreso_confirmado',
  'disputada',
  'liberada',
  'liquidada',
  'reembolsada',
  'cancelada',
] as const satisfies readonly OrderState[];

export const ORDER_EVENTS = [
  'MANUAL_PENDING',
  'PROOF_SUBMITTED',
  'MANUAL_EXPIRED',
  'MANUAL_APPROVED',
  'MANUAL_REJECTED',
  'MANUAL_EVENT_CANCELLED',
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
    // Manual (Yappy / ACH) checkout: the listing is held while the buyer transfers; no money yet.
    MANUAL_PENDING: 'transferencia_pendiente',
    CHECKOUT_ABANDONED: 'cancelada',
    EVENT_CANCELLED: 'cancelada',
  },
  // Manual payment whose receipt an admin has yet to review. Holds no confirmed money either.
  comprobante_en_revision: {
    PROOF_SUBMITTED: 'comprobante_en_revision',
    // An admin checked the receipt: approved (money confirmed) or rejected (nothing was paid).
    MANUAL_APPROVED: 'entrada_recibida',
    MANUAL_REJECTED: 'cancelada',
    MANUAL_EVENT_CANCELLED: 'cancelada',
    EVENT_CANCELLED: 'cancelada',
  },
  transferencia_pendiente: {
    PROOF_SUBMITTED: 'comprobante_en_revision',
    MANUAL_EXPIRED: 'cancelada',
    // Manual orders only (service.ts checks paymentMethod): never a gateway refund, nothing was charged.
    MANUAL_APPROVED: 'entrada_recibida',
    MANUAL_REJECTED: 'cancelada',
    MANUAL_EVENT_CANCELLED: 'cancelada',
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
