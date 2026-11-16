import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { listVerifiedListings } from '@/lib/tickets/listings';

// Public catalogue of an event (RF-06): verified listings only, cheapest first. Never
// exposes the seller, file paths or fingerprints.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const rows = await listVerifiedListings(getDb(), id);
    // Explicit projection: the response shape cannot grow by accident.
    const items = rows.map(({ id, askCents, deliveryMode, eventId }) => ({ id, askCents, deliveryMode, eventId }));
    return NextResponse.json({ listings: items }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('event listings route error', e instanceof Error ? e.name : 'UnknownError');
    return NextResponse.json({ error: 'Error interno. Intenta de nuevo.' }, { status: 500 });
  }
}
