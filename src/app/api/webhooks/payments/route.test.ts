import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { orders } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { startCheckout } from '@/lib/orders/service';
import { seedListing } from '@/lib/orders/test-fixtures';

const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));

const { POST } = await import('./route');

const SECRET = 'route-secret';
let gw: FakeGateway;
let orderId: string;

beforeEach(async () => {
  process.env.FAKE_GATEWAY_SECRET = SECRET;
  h.db = await makeTestDb();
  gw = new FakeGateway(SECRET);
  const { buyer, listing } = await seedListing(h.db, { askCents: 5000 });
  ({ orderId } = await startCheckout(h.db, gw, buyer.id, listing.id));
});

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost/api/webhooks/payments', {
      method: 'POST',
      body: rawBody,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );
}

const state = async () => (await h.db.select().from(orders).where(eq(orders.id, orderId)))[0].state;

describe('POST /api/webhooks/payments', () => {
  it('400 on an invalid signature, order untouched', async () => {
    const { rawBody } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    const res = await post(rawBody, { 'x-fake-signature': new FakeGateway('wrong').sign(rawBody) });
    expect(res.status).toBe(400);
    expect(await state()).toBe('creada');
  });

  it('200 on a valid paid webhook, and 200 again on replay', async () => {
    const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    expect((await post(rawBody, headers)).status).toBe(200);
    expect((await post(rawBody, headers)).status).toBe(200);
    expect(await state()).toBe('transferencia_pendiente');
  });

  it('422 on an amount mismatch', async () => {
    const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 1 });
    expect((await post(rawBody, headers)).status).toBe(422);
    expect(await state()).toBe('creada');
  });

  it('404 on an unknown payment reference', async () => {
    const { rawBody, headers } = gw.buildWebhook({ providerRef: 'fake_unknown', status: 'paid', amountCents: 5000 });
    expect((await post(rawBody, headers)).status).toBe(404);
  });
});

describe('POST /api/webhooks/payments: alerts (RNF-10)', () => {
  const lines = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])) as Record<string, unknown>);

  it('an amount mismatch raises an alert (money arrived that does not match the order)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 1 });
    await post(rawBody, headers);
    expect(lines(errors)).toContainEqual(expect.objectContaining({ alert: true, msg: 'payment_webhook_amount_mismatch' }));
    errors.mockRestore();
  });

  it('an unexpected failure is a 500 (the provider retries) with an alert carrying the error name only', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realTx = h.db.transaction.bind(h.db);
    vi.spyOn(h.db, 'transaction').mockImplementation((() => {
      throw new Error('db down params +50761234567');
    }) as unknown as typeof realTx);
    const { rawBody, headers } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    const res = await post(rawBody, headers);
    expect(res.status).toBe(500);
    expect(lines(errors)).toContainEqual(
      expect.objectContaining({ alert: true, msg: 'payment_webhook_failed', ctx: { error: 'Error' } }),
    );
    expect(JSON.stringify(errors.mock.calls)).not.toContain('61234567');
    vi.restoreAllMocks();
  });

  it('a bad signature is logged as a warning, not an alert (anyone can post junk)', async () => {
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rawBody } = gw.buildWebhook({ providerRef: `fake_${orderId}`, status: 'paid', amountCents: 5000 });
    await post(rawBody, { 'x-fake-signature': 'nope' });
    expect(lines(warns)).toContainEqual(expect.objectContaining({ level: 'warn', msg: 'payment webhook rejected' }));
    warns.mockRestore();
  });
});
