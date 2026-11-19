import type { OrderState } from '@/lib/orders/state-machine';

export type StageClass = '' | 'is-done' | 'is-alert';

/**
 * The three escrow stages an order card shows (held, delivered, closed) as CSS state classes.
 * Null for orders that ended without a sale: they have no track to show.
 */
export function escrowStages(state: OrderState): [StageClass, StageClass, StageClass] | null {
  switch (state) {
    case 'reembolsada':
    case 'cancelada':
      return null;
    case 'disputada':
      return ['is-done', 'is-alert', ''];
    case 'liberada':
    case 'liquidada':
      return ['is-done', 'is-done', 'is-done'];
    case 'entrada_recibida':
    case 'ingreso_confirmado':
      return ['is-done', 'is-done', ''];
    case 'transferencia_pendiente':
    case 'comprobante_en_revision':
      return ['is-done', '', ''];
    case 'creada':
      return ['', '', ''];
  }
}
