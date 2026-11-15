import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { ListingUnavailableError, SelfPurchaseError, startCheckout } from '@/lib/orders/service';
import { FakeGateway } from '@/lib/payments/fake-gateway';

const body = z.object({ listingId: z.uuid() });

export async function POST(req: NextRequest) {
  const db = getDb();
  const session = await getSession(db, req.cookies.get('session')?.value ?? '');
  if (!session) {
    return NextResponse.json({ error: 'Inicia sesión para comprar' }, { status: 401 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
  try {
    // Test-mode gateway until a real adapter is configured.
    const result = await startCheckout(db, new FakeGateway(), session.userId, parsed.data.listingId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ListingUnavailableError) {
      return NextResponse.json({ error: 'Esta entrada ya no está disponible' }, { status: 409 });
    }
    if (e instanceof SelfPurchaseError) {
      return NextResponse.json({ error: 'No puedes comprar tu propia entrada' }, { status: 422 });
    }
    throw e;
  }
}
