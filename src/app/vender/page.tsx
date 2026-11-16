import { profileOf, upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { DEFAULT_PRICE_CAP_BPS } from '@/lib/pricing/pricing';
import EmptyState from '../_components/empty-state';
import { requireUser } from '../session';
import IdentityForm from './identity-form';
import ListingForm from './listing-form';

export const metadata = { title: 'Vender una entrada' };
export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const user = await requireUser('/vender');
  const db = getDb();
  const profile = await profileOf(db, user.userId);
  const status = profile?.identityStatus ?? 'none';
  const events = status === 'approved' ? (await upcomingEvents(db)).filter((e) => !e.resaleProhibited) : [];
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">
          {status === 'approved' ? 'Paso 2 de 2 · Publica' : 'Paso 1 de 2 · Verifica tu identidad'}
        </p>
        <h1>Vender una entrada</h1>
        {status === 'none' ? (
          <p className="lead">Para vender necesitamos verificar quién eres. Así protegemos a los compradores de estafas.</p>
        ) : null}
      </header>

      {status === 'none' || status === 'rejected' ? (
        <>
          {status === 'rejected' ? (
            <p className="notice warning">No pudimos verificar tu identidad. Vuelve a enviar tus documentos con fotos más claras.</p>
          ) : null}
          <IdentityForm />
        </>
      ) : null}

      {status === 'pending' ? (
        <EmptyState>
          <p>Estamos revisando tu identidad.</p>
          <p className="muted">Te avisaremos aquí cuando puedas publicar entradas.</p>
        </EmptyState>
      ) : null}

      {status === 'approved' ? (
        events.length === 0 ? (
          <EmptyState>
            <p>No hay eventos disponibles para publicar por ahora.</p>
          </EmptyState>
        ) : (
          <ListingForm
            capBps={DEFAULT_PRICE_CAP_BPS}
            events={events.map((e) => ({
              id: e.id,
              name: e.name,
              faceValueCents: e.faceValueCents,
              allowsTransfer: e.allowsTransfer,
            }))}
          />
        )
      ) : null}
    </main>
  );
}
