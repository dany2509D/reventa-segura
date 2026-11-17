import EventPoster from '../_components/event-poster';
import { IconArrowDown, IconArrowRight, IconPin } from '../_components/icons';
import { HoverCard, StaggerGrid, StaggerItem } from '../_components/motion-primitives';
import type { EventView, HomeData } from './view-model';

/**
 * Section 01: up to three large editorial cards. Asymmetric on purpose: the first card leads
 * (7 of 12 columns), the others sit beside it. Nothing renders when there are no events.
 */
export default async function FeaturedEvents({ data }: { data: Promise<HomeData> }) {
  const { featured, featuredHaveTickets, events } = await data;
  if (featured.length === 0) return null;
  return (
    <section className="section container" aria-labelledby="destacados-title">
      <header className="section-head reveal">
        <p className="eyebrow">
          <span className="idx">01</span> En cartelera
        </p>
        <h2 id="destacados-title" className="section-title-xl">
          Eventos destacados
        </h2>
        <p className="section-desc">
          {featuredHaveTickets
            ? 'Los más próximos con entradas a la venta, publicadas por vendedores con identidad verificada.'
            : 'Los eventos más próximos. Todavía no tienen entradas publicadas.'}
        </p>
        {events.length > featured.length ? (
          <a className="section-link" href="#eventos">
            Ver todos los eventos
            <IconArrowDown />
          </a>
        ) : null}
      </header>
      <StaggerGrid className={`feature-grid feature-grid--${featured.length}`}>
        {featured.map((event, i) => (
          <StaggerItem key={event.id} className={`feature-cell${i === 0 ? ' is-lead' : ''}`}>
            <HoverCard>
              <FeatureCard event={event} index={i} />
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerGrid>
    </section>
  );
}

function FeatureCard({ event, index }: { event: EventView; index: number }) {
  return (
    <a className={`feature-card on-art${index === 0 ? ' is-lead' : ''}`} href={`/eventos/${event.id}`} data-card="">
      <div className="feature-art">
        <EventPoster seed={event.id} title={event.name} size="feature" />
      </div>
      <div className="feature-top">
        <time className="date-badge" dateTime={event.date.iso}>
          <b>{event.date.day}</b>
          <span>{event.date.month}</span>
        </time>
        {event.count > 0 ? (
          <span className={`art-pill${event.count <= 2 ? ' is-last' : ''}`}>
            {event.count <= 2 ? 'Últimas entradas' : `${event.count} entradas disponibles`}
          </span>
        ) : null}
      </div>
      <div className="feature-body">
        <p className="feature-meta">
          <span>
            {event.date.weekday} · {event.date.time}
          </span>
          <span className="venue">
            <IconPin />
            {event.venue}
          </span>
        </p>
        <h3 className="feature-name">{event.name}</h3>
        <div className="feature-foot">
          <p className="feature-price">
            {event.from ? (
              <>
                <span className="price-label">Desde</span>
                <strong>{event.from}</strong>
              </>
            ) : (
              <span className="feature-none">{event.resaleProhibited ? 'Reventa no permitida' : 'Sin entradas por ahora'}</span>
            )}
          </p>
          <span className="cta-pill">
            <span>{event.count > 0 ? 'Ver entradas' : 'Ver evento'}</span>
            <IconArrowRight />
          </span>
        </div>
      </div>
    </a>
  );
}
