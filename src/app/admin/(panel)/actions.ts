'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseEventForm } from '@/lib/admin/forms';
import { getDb } from '@/lib/db/client';
import { resolveDispute } from '@/lib/disputes/disputes';
import { cancelEvent, createEvent } from '@/lib/events/events';
import { reviewIdentity } from '@/lib/identity/identity';
import { errorName, log } from '@/lib/observability/log';
import { getPaymentGateway } from '@/lib/payments';
import { markPayoutPaid, queuePayoutOnRelease } from '@/lib/payouts/payouts';
import { reviewListing } from '@/lib/tickets/listings';
import { requireAdminPage } from '../session';

// Every action: gate (admin + 2FA) → do the work in the domain layer → redirect back with a flash
// message. Domain errors become short Spanish messages; nothing else about them reaches the page.
const MESSAGES: Record<string, string> = {
  ForbiddenError: 'No tienes permiso para esta acción.',
  NotFoundError: 'No se encontró el registro.',
  ValidationError: 'Los datos enviados no son válidos.',
  PayoutStateError: 'Este pago ya no se puede registrar (estado de la orden o del pago).',
  ListingStateError: 'La publicación ya fue revisada.',
  IdentityStateError: 'La identidad ya no está pendiente.',
  InvalidTransitionError: 'La orden ya cambió de estado.',
};

async function run(path: string, work: (actor: Awaited<ReturnType<typeof requireAdminPage>>) => Promise<string | void>) {
  const actor = await requireAdminPage();
  let flash: { kind: 'ok' | 'error'; text: string } | null = null;
  try {
    const done = await work(actor);
    flash = { kind: 'ok', text: done || 'Listo.' };
  } catch (e) {
    const name = errorName(e);
    log('error', 'admin action failed', { error: name }); // never the message: it can carry ids or parameters
    flash = { kind: 'error', text: MESSAGES[name] ?? 'No se pudo completar la acción.' };
  }
  revalidatePath(path);
  redirect(`${path}?${flash.kind}=${encodeURIComponent(flash.text)}`);
}

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

export async function reviewIdentityAction(fd: FormData) {
  await run('/admin/identidades', async (actor) => {
    const decision = field(fd, 'decision') === 'approved' ? 'approved' : 'rejected';
    await reviewIdentity(getDb(), actor, field(fd, 'userId'), decision);
    return decision === 'approved' ? 'Identidad aprobada.' : 'Identidad rechazada.';
  });
}

export async function reviewListingAction(fd: FormData) {
  await run('/admin/publicaciones', async (actor) => {
    const decision = field(fd, 'decision') === 'verified' ? 'verified' : 'rejected';
    await reviewListing(getDb(), actor, field(fd, 'listingId'), decision, field(fd, 'reason') || undefined);
    return decision === 'verified' ? 'Publicación verificada.' : 'Publicación rechazada.';
  });
}

export async function resolveDisputeAction(fd: FormData) {
  await run('/admin/disputas', async (actor) => {
    const decision = field(fd, 'decision') === 'release' ? 'release' : 'refund';
    // 'release' queues the seller's payout inside the same transaction.
    await resolveDispute(getDb(), getPaymentGateway(), actor, field(fd, 'disputeId'), decision, new Date(), {
      onReleased: queuePayoutOnRelease,
    });
    return decision === 'release' ? 'Dinero liberado al vendedor.' : 'Comprador reembolsado.';
  });
}

export async function markPayoutPaidAction(fd: FormData) {
  await run('/admin/pagos', async (actor) => {
    await markPayoutPaid(getDb(), actor, field(fd, 'payoutId'), field(fd, 'bankRef'));
    return 'Pago registrado.';
  });
}

export async function createEventAction(fd: FormData) {
  await run('/admin/eventos', async (actor) => {
    await createEvent(getDb(), actor, parseEventForm(fd));
    return 'Evento creado.';
  });
}

export async function cancelEventAction(fd: FormData) {
  await run('/admin/eventos', async (actor) => {
    if (field(fd, 'confirm') !== 'on') return 'Marca la casilla para confirmar la cancelación.';
    const r = await cancelEvent(getDb(), getPaymentGateway(), actor, field(fd, 'eventId'));
    return `Evento cancelado. Reembolsos: ${r.refunded}, a revisión manual: ${r.manualReview}, fallidos: ${r.failed}.`;
  });
}
