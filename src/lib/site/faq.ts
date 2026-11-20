/**
 * Frequently asked questions of the home page, and the source of its FAQPage structured data.
 * Each answer restates what the platform really does (the same rules as "Cómo funciona" and the
 * legal pages); the numbers come from the pricing and entry rules so they cannot drift.
 */
import { CONFIRMATION_WINDOW_MS } from '@/lib/entry/confirmation';
import { DEFAULT_FEE_BPS, DEFAULT_PRICE_CAP_BPS } from '@/lib/pricing/pricing';

export interface FaqItem {
  question: string;
  answer: string;
}

const percent = (bps: number) => String(bps / 100).replace('.', ',');
const WINDOW_HOURS = CONFIRMATION_WINDOW_MS / (60 * 60 * 1000);

export function faqItems(): FaqItem[] {
  return [
    {
      question: '¿Cómo funciona el pago protegido?',
      answer: `Pagas dentro de la plataforma con tarjeta, Yappy o ACH. El dinero no pasa al vendedor: queda retenido y se libera cuando cierra el plazo de reportes, ${WINDOW_HOURS} horas después del inicio del evento.`,
    },
    {
      question: '¿Qué hago si la entrada no llega o no funciona?',
      answer: `Abre una disputa desde Mis órdenes, hasta ${WINDOW_HOURS} horas después del inicio del evento. Nuestro equipo la revisa y, si procede, te devolvemos el dinero.`,
    },
    {
      question: '¿Cómo recibo mi entrada?',
      answer:
        'El vendedor te la transfiere por la boletera (Panatickets, Ticketplus u otra) o te envía la imagen. Tú confirmas en Mis órdenes que la recibiste y, el día del evento, que entraste.',
    },
    {
      question: '¿Cómo vendo una entrada?',
      answer:
        'Ingresas con tu celular, verificas tu identidad con tu cédula o pasaporte y una selfie, y publicas la entrada eligiendo el evento y tu precio. Revisamos cada publicación antes de mostrarla.',
    },
    {
      question: '¿Cuánto cuesta vender y cuál es el precio máximo?',
      answer: `La comisión es del ${percent(DEFAULT_FEE_BPS)} % por venta y se descuenta del pago al vendedor, no se suma a lo que paga el comprador. El precio puede llegar hasta el ${percent(DEFAULT_PRICE_CAP_BPS)} % del valor original de la entrada.`,
    },
    {
      question: '¿Qué pasa si el evento se cancela?',
      answer: 'Si un evento se cancela, retiramos sus publicaciones y reembolsamos las órdenes pagadas de ese evento.',
    },
    {
      question: '¿Se puede revender la entrada de cualquier evento?',
      answer:
        'No. Algunos eventos prohíben la reventa o la transferencia y los marcamos para que no se publiquen entradas. Además, una boletera o un recinto puede restringir las entradas revendidas; si te rechazan en la puerta, abre una disputa.',
    },
  ];
}
