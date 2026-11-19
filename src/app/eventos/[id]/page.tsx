import { notFound } from 'next/navigation';
import { eventDetail } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatUsd } from '@/lib/format';
import { listVerifiedListings } from '@/lib/tickets/listings';
import { longDateLabel, panamaDateParts } from '@/lib/ui/dates';
import { eventCoverImage } from '@/lib/ui/event-cover';
import BackLink from '../../_components/back-link';
import EmptyState from '../../_components/empty-state';
import EventPoster from '../../_components/event-poster';
import { IconArrowRight } from '../../_components/icons';
import { TestModeNotice } from '../../_components/test-mode';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const event = await eventDetail(db, id);
  if (!event || event.status !== 'active') notFound();
  const offers = event.resaleProhibited ? [] : await listVerifiedListings(db, id);
  const date = panamaDateParts(event.startsAt);
  return (
    <main className="page wide">
      <BackLink href="/eventos">Todos los eventos</BackLink>
      <div className="event-layout">
        {/* Same generative poster as the event's cards; `poster-hero` is the shared element of the page transition. */}
        <div className="event-art">
          <EventPoster
            seed={event.id}
            title={event.name}
            image={eventCoverImage(event.id, event.name, event.venue)}
            size="hero"
            sizes="(max-width: 1023px) 100vw, 45vw"
            priority
            className="poster-hero"
          />
        </div>
        <div className="event-main">
          <p className="eyebrow">
            <span className="dot" aria-hidden="true" />
            <time dateTime={date.iso}>
              {date.weekday} {Number(date.day)} {date.month} {date.year} · {date.time}
            </time>
          </p>
          <h1>{event.name}</h1>
          <dl className="facts">
            <div>
              <dt>Lugar</dt>
              <dd>{event.venue}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{longDateLabel(date)}</dd>
            </div>
            <div>
              <dt>Valor original</dt>
              <dd className="money">{formatUsd(event.faceValueCents)}</dd>
            </div>
          </dl>

          {event.resaleProhibited ? (
            <p className="notice warning">El organizador de este evento prohíbe la reventa de entradas, por eso no vendemos entradas de este evento.</p>
          ) : (
            <>
              <p className="notice">
                Algunas boleteras o recintos pueden restringir las entradas revendidas. Si te rechazan en la puerta, abre una disputa: el
                equipo la revisa y, si procede, te devuelve el dinero.
              </p>
              <h2 className="section-title">
                Entradas disponibles
                {offers.length > 0 ? <span className="count">{String(offers.length).padStart(2, '0')}</span> : null}
              </h2>
              {offers.length === 0 ? (
                <EmptyState>
                  <p>No hay entradas publicadas por ahora.</p>
                  <p className="muted">
                    ¿Tienes una que no vas a usar? <a href="/vender">Véndela aquí</a>.
                  </p>
                </EmptyState>
              ) : (
                <>
                  <ul className="offers">
                    {offers.map((o, i) => (
                      <li key={o.id} className={`card offer reveal reveal-${Math.min(i, 4)}`}>
                        <div>
                          <span className="price-label">Precio</span>
                          <div className="price">{formatUsd(o.askCents)}</div>
                          <div className="tags">
                            <span className="tag">
                              {o.deliveryMode === 'transfer' ? (
                                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M7 7h11l-3-3M17 17H6l3 3" />
                                </svg>
                              ) : (
                                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z" />
                                </svg>
                              )}
                              {o.deliveryMode === 'transfer' ? 'Te la transfieren en la boletera' : 'Recibes la entrada en la app'}
                            </span>
                            {o.askCents < event.faceValueCents ? (
                              <span className="tag offer-deal">Bajo valor nominal</span>
                            ) : null}
                          </div>
                        </div>
                        <a className="btn" href={`/comprar/${o.id}`}>
                          Comprar
                          <IconArrowRight />
                        </a>
                      </li>
                    ))}
                  </ul>
                  <div className="offers-foot">
                    <TestModeNotice />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
