import type { OrderState } from '@/lib/orders/state-machine';

/** Spanish wording for what members see. Pure data: no money or state logic lives here. */

export type ListingStatus = 'pending' | 'verified' | 'rejected' | 'sold' | 'withdrawn';
export type DeliveryMode = 'transfer' | 'file';
export type BuyerAction = 'upload_received' | 'view_ticket' | 'confirm_entry' | 'dispute' | 'pay_manual';

const ORDER_LABELS: Record<OrderState, string> = {
  creada: 'Pago pendiente',
  transferencia_pendiente: 'Esperando la entrada',
  comprobante_en_revision: 'Comprobante en revisión',
  entrada_recibida: 'Entrada recibida',
  ingreso_confirmado: 'Ingreso confirmado',
  disputada: 'En disputa',
  liberada: 'Completada',
  liquidada: 'Completada y pagada',
  reembolsada: 'Reembolsada',
  cancelada: 'Cancelada',
};

export const orderStatusLabel = (s: OrderState): string => ORDER_LABELS[s];

export function buyerNextStep(o: {
  state: OrderState;
  deliveryMode: DeliveryMode;
  hasOpenDispute: boolean;
  /** Set for manual (Yappy / ACH) orders; they are paid off-platform. */
  paymentMethod?: 'yappy' | 'ach' | null;
}): { text: string; actions: BuyerAction[] } {
  if (o.paymentMethod && o.state === 'transferencia_pendiente') {
    return {
      text: 'Haz la transferencia con tu código de referencia y sube el comprobante antes de que termine el plazo, o la reserva se libera.',
      actions: ['pay_manual'],
    };
  }
  switch (o.state) {
    case 'comprobante_en_revision':
      return {
        text: 'Recibimos tu comprobante. Estamos verificando el pago; puedes reemplazarlo mientras tanto si te equivocaste.',
        actions: ['pay_manual'],
      };
    case 'creada':
      return { text: 'Aún no recibimos tu pago. Si no se completa, la reserva se libera sola.', actions: [] };
    case 'transferencia_pendiente':
      return {
        text:
          'Tu pago está protegido. El vendedor debe transferirte la entrada en la boletera antes del plazo. ' +
          'Cuando la veas en tu cuenta de la boletera, sube una captura para confirmarlo. Si no llega, te reembolsamos.',
        actions: ['upload_received', 'dispute'],
      };
    case 'entrada_recibida':
      return {
        text:
          o.deliveryMode === 'file'
            ? 'Ya puedes ver tu entrada. El día del evento confirma tu ingreso para liberar el pago al vendedor.'
            : 'Tienes la entrada en tu cuenta de la boletera. El día del evento confirma tu ingreso para liberar el pago al vendedor.',
        actions: o.deliveryMode === 'file' ? ['view_ticket', 'confirm_entry', 'dispute'] : ['confirm_entry', 'dispute'],
      };
    case 'ingreso_confirmado':
      return {
        text: 'Confirmaste tu ingreso. El pago se libera al vendedor al cerrar la ventana de disputas; si hubo un problema, avísanos ahora.',
        actions: ['dispute'],
      };
    case 'disputada':
      return {
        text: o.hasOpenDispute
          ? 'Estamos revisando tu caso. Te avisaremos cuando haya una decisión: reembolso o liberación del pago.'
          : 'Tu caso fue revisado.',
        actions: [],
      };
    case 'liberada':
    case 'liquidada':
      return { text: 'Todo salió bien: el pago ya se liberó al vendedor. ¡Gracias!', actions: [] };
    case 'reembolsada':
      return { text: 'Te devolvimos el dinero completo por esta compra.', actions: [] };
    case 'cancelada':
      return { text: 'Esta compra se canceló y no se te cobró.', actions: [] };
  }
}

export function sellerNextStep(o: {
  state: OrderState;
  deliveryMode: DeliveryMode;
  payoutStatus: 'queued' | 'paid' | null;
}): string {
  switch (o.state) {
    case 'creada':
    case 'comprobante_en_revision':
      return 'El comprador aún no completa el pago.';
    case 'transferencia_pendiente':
      return 'Vendida. Transfiere la entrada al comprador en la boletera antes del plazo, o se reembolsa.';
    case 'entrada_recibida':
    case 'ingreso_confirmado':
      return 'El comprador ya tiene la entrada. Tu pago se libera tras el evento si no hay disputas.';
    case 'disputada':
      return 'El comprador abrió una disputa. La estamos revisando.';
    case 'liberada':
      return o.payoutStatus === 'queued' ? 'Pago en cola: te transferimos pronto a tu cuenta.' : 'Pago liberado.';
    case 'liquidada':
      return 'Pagado: ya te transferimos el dinero.';
    case 'reembolsada':
      return 'La venta se reembolsó al comprador.';
    case 'cancelada':
      return 'La compra se canceló.';
  }
}

const LISTING_LABELS: Record<ListingStatus, string> = {
  pending: 'En revisión',
  verified: 'Publicada',
  rejected: 'Rechazada',
  sold: 'Vendida',
  withdrawn: 'Retirada',
};

export const listingStatusLabel = (s: ListingStatus): string => LISTING_LABELS[s];
