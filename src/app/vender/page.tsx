import { profileOf, upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { DEFAULT_PRICE_CAP_BPS } from '@/lib/pricing/pricing';
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
      <h1>Vender una entrada</h1>

      {status === 'none' || status === 'rejected' ? (
        <>
          {status === 'rejected' ? (
            <p className="notice">No pudimos verificar tu identidad. Vuelve a enviar tus documentos con fotos más claras.</p>
          ) : (
            <p>Para vender necesitamos verificar quién eres. Así protegemos a los compradores de estafas.</p>
          )}
          <IdentityForm />
        </>
      ) : null}

      {status === 'pending' ? (
        <p className="notice">Estamos revisando tu identidad. Te avisaremos aquí cuando puedas publicar entradas.</p>
      ) : null}

      {status === 'approved' ? (
        events.length === 0 ? (
          <p>No hay eventos disponibles para publicar por ahora.</p>
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
