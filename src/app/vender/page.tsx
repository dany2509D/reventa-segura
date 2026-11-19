import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { profileOf, upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { DEFAULT_FEE_BPS, DEFAULT_PRICE_CAP_BPS } from '@/lib/pricing/pricing';
import { panamaDateParts, shortDateLabel } from '@/lib/ui/dates';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../_components/empty-state';
import { IconShieldCheck } from '../_components/icons';
import { requireUser } from '../session';
import IdentityForm from './identity-form';
import ListingForm from './listing-form';

export const metadata = { title: 'Publicar una entrada' };
export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const user = await requireUser('/vender');
  const db = getDb();
  const [row] = await db.select({ at: users.phoneVerifiedAt }).from(users).where(eq(users.id, user.userId));
  if (!row?.at) redirect('/ingresar?next=%2Fvender');
  const profile = await profileOf(db, user.userId);
  const status = profile?.identityStatus ?? 'none';
  const events = status === 'approved' ? (await upcomingEvents(db)).filter((e) => !e.resaleProhibited) : [];
  return (
    <section className="section-panel" aria-labelledby="sell-title">
      <header className="page-head">
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" />
          {status === 'approved' ? 'Paso 2 de 2 · Publica' : 'Paso 1 de 2 · Verifica tu identidad'}
        </p>
        <h2 id="sell-title">Publicar una entrada</h2>
        {status === 'none' ? (
          <p className="lead">Para vender necesitamos verificar quién eres. Así protegemos a los compradores de estafas.</p>
        ) : null}
      </header>

      {status === 'none' || status === 'rejected' ? (
        <div className="flow-layout">
          <aside className="flow-aside" aria-label="Pasos para vender">
            <ol className="flow-steps">
              <li className="flow-step is-active">
                <span className="flow-step-num" aria-hidden="true">01</span>
                <div>
                  <strong className="flow-step-title">Verifica tu identidad</strong>
                  <span className="flow-step-desc">Cédula o pasaporte + selfie rápida.</span>
                </div>
              </li>
              <li className="flow-step">
                <span className="flow-step-num" aria-hidden="true">02</span>
                <div>
                  <strong className="flow-step-title">Publica tu entrada</strong>
                  <span className="flow-step-desc">Define tu precio y método de entrega.</span>
                </div>
              </li>
              <li className="flow-step">
                <span className="flow-step-num" aria-hidden="true">03</span>
                <div>
                  <strong className="flow-step-title">Cobras tras el evento</strong>
                  <span className="flow-step-desc">Retención escrow hasta 12 h post-inicio.</span>
                </div>
              </li>
            </ol>
            <section className="protect on-scrim" aria-labelledby="kyc-safety-title">
              <div className="protect-head">
                <span className="protect-icon" aria-hidden="true">
                  <IconShieldCheck />
                </span>
                <h2 id="kyc-safety-title">Tus documentos son privados</h2>
              </div>
              <p className="muted">
                Solo nuestro equipo de moderación revisa tu cédula y selfie para evitar cuentas falsas. Nunca se muestran a los compradores.
              </p>
            </section>
          </aside>
          <div className="flow-card">
            {status === 'rejected' ? (
              <p className="notice warning">No pudimos verificar tu identidad. Vuelve a enviar tus documentos con fotos más claras.</p>
            ) : null}
            <IdentityForm />
          </div>
        </div>
      ) : null}

      {status === 'pending' ? (
        <EmptyState>
          <p>Estamos revisando tu identidad.</p>
          <p className="muted">Te avisaremos aquí cuando puedas publicar entradas.</p>
          <a className="btn sm secondary" href="/eventos">Volver a eventos</a>
        </EmptyState>
      ) : null}

      {status === 'approved' ? (
        events.length === 0 ? (
          <EmptyState>
            <p>No hay eventos disponibles para publicar por ahora.</p>
            <a className="btn sm secondary" href="/eventos">Ver cartelera</a>
          </EmptyState>
        ) : (
          <ListingForm
            capBps={DEFAULT_PRICE_CAP_BPS}
            feeBps={DEFAULT_FEE_BPS}
            events={events.map((e) => ({
              id: e.id,
              name: e.name,
              venue: e.venue,
              dateShort: shortDateLabel(panamaDateParts(e.startsAt)),
              faceValueCents: e.faceValueCents,
              allowsTransfer: e.allowsTransfer,
              cover: eventCoverImage(e.id, e.name, e.venue),
            }))}
          />
        )
      ) : null}
    </section>
  );
}
