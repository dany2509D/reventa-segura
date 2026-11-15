import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { AmountMismatchError, UnknownPaymentError, handlePaymentWebhook } from '@/lib/orders/service';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { InvalidWebhookError } from '@/lib/payments/gateway';

export async function POST(req: Request) {
  // The signature covers the exact bytes received, so read the body as raw text.
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);
  try {
    // Test-mode gateway until a real adapter is configured.
    await handlePaymentWebhook(getDb(), new FakeGateway(), rawBody, headers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidWebhookError) {
      return NextResponse.json({ error: 'invalid webhook' }, { status: 400 });
    }
    if (e instanceof AmountMismatchError) {
      return NextResponse.json({ error: 'amount mismatch' }, { status: 422 });
    }
    if (e instanceof UnknownPaymentError) {
      return NextResponse.json({ error: 'unknown payment' }, { status: 404 });
    }
    throw e; // 500: the provider retries; processing is idempotent.
  }
}
