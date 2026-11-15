export type PaymentStatus = 'paid' | 'failed';

/** A verified notification from the payment provider. */
export type PaymentWebhook = {
  providerRef: string;
  status: PaymentStatus;
  /** Amount the provider reports for this payment; checked against the order price. */
  amountCents: number;
};

/**
 * Hosted-checkout payment provider. Card/Yappy data never reaches our servers.
 *
 * Contract for real adapters:
 * - `parseWebhook` MUST verify the provider signature over the raw body and throw
 *   `InvalidWebhookError` on any failure (bad signature, malformed payload).
 * - `refund` MUST be idempotent per `providerRef` (send it as the provider's idempotency key) so a
 *   retried webhook can never refund the same payment twice.
 */
export interface PaymentGateway {
  createCheckout(i: { orderId: string; amountCents: number }): Promise<{ checkoutUrl: string; providerRef: string }>;
  parseWebhook(rawBody: string, headers: Record<string, string>): PaymentWebhook;
  refund(providerRef: string, amountCents: number): Promise<{ refundRef: string }>;
}

export class InvalidWebhookError extends Error {
  constructor(message = 'Invalid payment webhook') {
    super(message);
    this.name = 'InvalidWebhookError';
  }
}
