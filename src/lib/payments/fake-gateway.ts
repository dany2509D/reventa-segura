import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { InvalidWebhookError, type PaymentGateway, type PaymentWebhook } from './gateway';

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

const webhookBody = z.object({
  providerRef: z.string().min(1).max(200),
  status: z.enum(['paid', 'failed']),
  amountCents: z.number().int().nonnegative(),
});

/**
 * Test-mode gateway (no real money). Webhooks are JSON `{ providerRef, status, amountCents }`
 * signed with HMAC-SHA256(secret, rawBody) as lowercase hex in `x-fake-signature`.
 */
export class FakeGateway implements PaymentGateway {
  readonly refunds: { providerRef: string; amountCents: number; refundRef: string }[] = [];
  private readonly secret: string;

  constructor(
    secret: string = process.env.FAKE_GATEWAY_SECRET ?? '',
    private readonly checkoutBaseUrl = '/pago-de-prueba',
  ) {
    if (!secret) throw new Error('FakeGateway requires a webhook secret (FAKE_GATEWAY_SECRET)');
    this.secret = secret;
  }

  async createCheckout(i: { orderId: string; amountCents: number }) {
    const providerRef = `fake_${i.orderId}`;
    return { providerRef, checkoutUrl: `${this.checkoutBaseUrl}/${encodeURIComponent(providerRef)}` };
  }

  parseWebhook(rawBody: string, headers: Record<string, string>): PaymentWebhook {
    const given = headerValue(headers, FAKE_SIGNATURE_HEADER);
    if (!given || !/^[0-9a-f]{64}$/i.test(given)) throw new InvalidWebhookError('Missing or malformed signature');
    const expected = createHmac('sha256', this.secret).update(rawBody, 'utf8').digest();
    if (!timingSafeEqual(Buffer.from(given, 'hex'), expected)) throw new InvalidWebhookError('Bad signature');

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new InvalidWebhookError('Malformed body');
    }
    const parsed = webhookBody.safeParse(json);
    if (!parsed.success) throw new InvalidWebhookError('Malformed body');
    return parsed.data;
  }

  /** Idempotent per providerRef, like the contract requires of real adapters. */
  async refund(providerRef: string, amountCents: number) {
    const refundRef = `fake_refund_${providerRef}`;
    this.refunds.push({ providerRef, amountCents, refundRef });
    return { refundRef };
  }

  sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody, 'utf8').digest('hex');
  }

  /** Builds a correctly signed webhook delivery (tests and the test-mode checkout page). */
  buildWebhook(w: PaymentWebhook): { rawBody: string; headers: Record<string, string> } {
    const rawBody = JSON.stringify(w);
    return { rawBody, headers: { [FAKE_SIGNATURE_HEADER]: this.sign(rawBody) } };
  }
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === name) return v;
  return undefined;
}
