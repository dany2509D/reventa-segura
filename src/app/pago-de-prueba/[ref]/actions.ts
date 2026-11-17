'use server';

import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { handlePaymentWebhook } from '@/lib/orders/service';
import { getPaymentGateway } from '@/lib/payments';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { requireUser } from '../../session';

// Plays the provider's part in test mode: a correctly signed webhook goes through the same
// handler a real provider would call. Only the buyer of that very order, only with the fake gateway.
export async function simulatePaymentAction(fd: FormData) {
  if (process.env.NODE_ENV === 'production') notFound(); // sandbox: unreachable in production
  const user = await requireUser('/mis-ordenes');
  const gw = getPaymentGateway();
  if (!(gw instanceof FakeGateway)) redirect('/');
  const ref = String(fd.get('ref') ?? '');
  const outcome = fd.get('outcome') === 'failed' ? 'failed' : 'paid';
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.providerRef, ref));
  if (!order || order.buyerId !== user.userId) redirect('/');
  const { rawBody, headers } = gw.buildWebhook({ providerRef: ref, status: outcome, amountCents: order.priceCents });
  await handlePaymentWebhook(db, gw, rawBody, headers);
  redirect(outcome === 'paid' ? '/mis-ordenes?pago=ok' : '/mis-ordenes?pago=rechazado');
}
