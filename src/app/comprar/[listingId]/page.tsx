import { notFound } from 'next/navigation';
import { listingOffer } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import BackLink from '../../_components/back-link';
import { toneFor } from '../../_components/doodle';
import { IconShieldCheck } from '../../_components/icons';
import { requireUser } from '../../session';
import BuyButton from './buy-button';

export const metadata = { title: 'Confirmar compra' };
export const dynamic = 'force-dynamic';

export default async function BuyPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const user = await requireUser(`/comprar/${listingId}`);
  const offer = await listingOffer(getDb(), listingId);
  if (!offer || offer.resaleProhibited) notFound();
  const own = offer.sellerId === user.userId;
  return (
    <main className="page buy-page">
      <BackLink href={`/eventos/${offer.eventId}`}>{offer.eventName}</BackLink>
      <h1>Confirmar compra</h1>
      <div className="stack">
        <div className={`card pastel summary tone-${toneFor(offer.eventId)}`}>
          <h3>{offer.eventName}</h3>
          <div className="tags">
            <span className="tag">{offer.venue}</span>
            <span className="tag">{formatPanamaDateTime(offer.startsAt)}</span>
          </div>
          <p className="price price-lg">{formatUsd(offer.askCents)}</p>
          <p className="muted">
            {offer.deliveryMode === 'transfer'
              ? 'El vendedor te transfiere la entrada en la boletera (Panatickets, Ticketplus u otra).'
              : 'Verás tu entrada aquí mismo después de pagar.'}
          </p>
        </div>
        <div className="card feature protect">
          <div className="protect-head">
            <span className="protect-icon" aria-hidden="true">
              <IconShieldCheck />
            </span>
            <h3>Tu pago está protegido</h3>
          </div>
          <ul className="checklist">
            <li>El vendedor no cobra hasta que tú entres al evento.</li>
            <li>Si no recibes una entrada válida, te devolvemos todo.</li>
            <li>Tienes hasta 12 horas después del inicio del evento para reportar un problema.</li>
          </ul>
          <p className="feature-note">
            Una boletera o recinto puede restringir entradas revendidas. Si te rechazan en la puerta, abre una disputa.
          </p>
        </div>
        {own ? (
          <p className="notice">Esta es tu propia publicación: no puedes comprarla.</p>
        ) : (
          <div className="sticky-cta">
            <BuyButton listingId={listingId} />
          </div>
        )}
      </div>
    </main>
  );
}
