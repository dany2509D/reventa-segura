import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeGateway, FAKE_SIGNATURE_HEADER } from './fake-gateway';
import { InvalidWebhookError } from './gateway';

const SECRET = 'test-secret';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
const body = (o: object) => JSON.stringify(o);

describe('FakeGateway', () => {
  it('createCheckout is deterministic and uses providerRef fake_<orderId>', async () => {
    const gw = new FakeGateway(SECRET);
    const a = await gw.createCheckout({ orderId: 'o-1', amountCents: 5000 });
    const b = await gw.createCheckout({ orderId: 'o-1', amountCents: 5000 });
    expect(a.providerRef).toBe('fake_o-1');
    expect(a).toEqual(b);
    expect(a.checkoutUrl).toContain('fake_o-1');
  });

  it('parseWebhook accepts a body signed with the shared secret', () => {
    const gw = new FakeGateway(SECRET);
    const raw = body({ providerRef: 'fake_o-1', status: 'paid', amountCents: 5000 });
    expect(gw.parseWebhook(raw, { [FAKE_SIGNATURE_HEADER]: sign(raw) })).toEqual({
      providerRef: 'fake_o-1',
      status: 'paid',
      amountCents: 5000,
    });
  });

  it('header lookup is case-insensitive', () => {
    const gw = new FakeGateway(SECRET);
    const raw = body({ providerRef: 'fake_o-1', status: 'failed', amountCents: 5000 });
    expect(gw.parseWebhook(raw, { 'X-Fake-Signature': sign(raw) }).status).toBe('failed');
  });

  it('buildWebhook produces a payload parseWebhook accepts', () => {
    const gw = new FakeGateway(SECRET);
    const { rawBody, headers } = gw.buildWebhook({ providerRef: 'fake_o-2', status: 'paid', amountCents: 1 });
    expect(gw.parseWebhook(rawBody, headers).providerRef).toBe('fake_o-2');
  });

  describe('rejects with InvalidWebhookError', () => {
    const gw = new FakeGateway(SECRET);
    const raw = body({ providerRef: 'fake_o-1', status: 'paid', amountCents: 5000 });
    it.each<[string, string, Record<string, string>]>([
      ['missing signature', raw, {}],
      ['signature from another secret', raw, { [FAKE_SIGNATURE_HEADER]: sign(raw, 'other') }],
      ['tampered body', raw.replace('5000', '1'), { [FAKE_SIGNATURE_HEADER]: sign(raw) }],
      ['truncated signature', raw, { [FAKE_SIGNATURE_HEADER]: sign(raw).slice(0, 10) }],
      ['non-hex signature', raw, { [FAKE_SIGNATURE_HEADER]: 'z'.repeat(64) }],
      ['valid signature over malformed JSON', '{nope', { [FAKE_SIGNATURE_HEADER]: sign('{nope') }],
      [
        'valid signature, unknown status',
        body({ providerRef: 'x', status: 'pending', amountCents: 1 }),
        { [FAKE_SIGNATURE_HEADER]: sign(body({ providerRef: 'x', status: 'pending', amountCents: 1 })) },
      ],
      [
        'valid signature, non-integer amount',
        body({ providerRef: 'x', status: 'paid', amountCents: 1.5 }),
        { [FAKE_SIGNATURE_HEADER]: sign(body({ providerRef: 'x', status: 'paid', amountCents: 1.5 })) },
      ],
    ])('%s', (_label, rawBody, headers) => {
      expect(() => gw.parseWebhook(rawBody, headers)).toThrow(InvalidWebhookError);
    });
  });

  it('refuses to start without a secret', () => {
    expect(() => new FakeGateway('')).toThrow();
  });

  it('reads the secret from FAKE_GATEWAY_SECRET by default', () => {
    const prev = process.env.FAKE_GATEWAY_SECRET;
    process.env.FAKE_GATEWAY_SECRET = 'env-secret';
    try {
      const gw = new FakeGateway();
      const raw = body({ providerRef: 'p', status: 'paid', amountCents: 1 });
      expect(gw.parseWebhook(raw, { [FAKE_SIGNATURE_HEADER]: sign(raw, 'env-secret') }).providerRef).toBe('p');
    } finally {
      if (prev === undefined) delete process.env.FAKE_GATEWAY_SECRET;
      else process.env.FAKE_GATEWAY_SECRET = prev;
    }
  });

  it('refund records the call and is idempotent per providerRef', async () => {
    const gw = new FakeGateway(SECRET);
    const a = await gw.refund('fake_o-1', 5000);
    const b = await gw.refund('fake_o-1', 5000);
    expect(a.refundRef).toBe(b.refundRef);
    expect(gw.refunds).toEqual([
      { providerRef: 'fake_o-1', amountCents: 5000, refundRef: a.refundRef },
      { providerRef: 'fake_o-1', amountCents: 5000, refundRef: a.refundRef },
    ]);
  });
});
