import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { alert, errorName, log } from '@/lib/observability/log';
import { AmountMismatchError, UnknownPaymentError, handlePaymentWebhook } from '@/lib/orders/service';
import { getPaymentGateway } from '@/lib/payments';
import { InvalidWebhookError } from '@/lib/payments/gateway';

// Payment provider notifications. Authenticated by the provider signature (verified in
// parseWebhook), so no Origin/content-type guard: the caller is a server, not a browser.
export async function POST(req: Request) {
  // The signature covers the exact bytes received, so read the body as raw text.
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);
  try {
    await handlePaymentWebhook(getDb(), getPaymentGateway(), rawBody, headers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidWebhookError) {
      log('warn', 'payment webhook rejected', { reason: e.name });
      return NextResponse.json({ error: 'invalid webhook' }, { status: 400 });
    }
    if (e instanceof AmountMismatchError) {
      alert('payment_webhook_amount_mismatch', { error: e.name });
      return NextResponse.json({ error: 'amount mismatch' }, { status: 422 });
    }
    if (e instanceof UnknownPaymentError) {
      log('warn', 'payment webhook for an unknown payment', { error: e.name });
      return NextResponse.json({ error: 'unknown payment' }, { status: 404 });
    }
    // 500: the provider retries; processing is idempotent. Never log the message.
    alert('payment_webhook_failed', { error: errorName(e) });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
