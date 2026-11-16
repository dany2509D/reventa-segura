import { posterSerial } from '@/lib/ui/poster';
import { IconArrowUpRight } from '../_components/icons';
import EventSearch from './event-search';
import { ticketCountLabel, type HomeData } from './view-model';

// The data-dependent parts of the hero. Each one awaits the same promise inside its own Suspense
// boundary (see page.tsx), so the headline is on screen before the events query answers.

export async function HeroSearch({ data }: { data: Promise<HomeData> }) {
  const { events } = await data;
  return <EventSearch events={events} />;
}

/** Real figures only: how many upcoming events and verified listings there are right now. */
export async function HeroStats({ data }: { data: Promise<HomeData> }) {
  const { totals } = await data;
  if (totals.events === 0) return <p className="hero-stats">Todavía no hay eventos publicados.</p>;
  return (
    <p className="hero-stats">
      <span>
        <b>{String(totals.events).padStart(2, '0')}</b> {totals.events === 1 ? 'evento próximo' : 'eventos próximos'}
      </span>
      <span>
        <b>{String(totals.listings).padStart(2, '0')}</b> {totals.listings === 1 ? 'entrada publicada' : 'entradas publicadas'}
      </span>
    </p>
  );
}

/** The ticket floating over the hero scene: the soonest real event, linking to it. */
export async function HeroTicket({ data }: { data: Promise<HomeData> }) {
  const { next } = await data;
  if (!next) {
    return (
      <div className="hero-ticket ticket">
        <div className="ticket-main">
          <p className="eyebrow">Agenda</p>
          <p className="hero-ticket-name">Pronto habrá eventos aquí.</p>
        </div>
        <div className="ticket-stub">
          <p className="hero-ticket-price">Vuelve en unos días.</p>
        </div>
      </div>
    );
  }
  return (
    <a className="hero-ticket ticket" href={`/eventos/${next.id}`} aria-label={`Próximo evento: ${next.name}, ${next.dateLong}, ${next.venue}`}>
      <span className="ticket-main">
        <span className="hero-ticket-top">
          <span className="eyebrow">
            <span className="dot" aria-hidden="true" />
            Próximo evento
          </span>
          <span className="hero-ticket-serial" aria-hidden="true">
            {posterSerial(next.id)}
          </span>
        </span>
        <strong className="hero-ticket-name">{next.name}</strong>
        <time className="hero-ticket-meta mono" dateTime={next.date.iso}>
          {next.dateShort}
        </time>
        <span className="hero-ticket-meta">{next.venue}</span>
      </span>
      <span className="ticket-stub hero-ticket-stub">
        <span className="hero-ticket-price">
          {next.from ? (
            <>
              <span className="price-label">Desde</span>
              <b>{next.from}</b>
              <span className="hero-ticket-count">{ticketCountLabel(next.count)}</span>
            </>
          ) : next.resaleProhibited ? (
            'Reventa no permitida'
          ) : (
            'Sin entradas por ahora'
          )}
        </span>
        <span className="round-arrow" aria-hidden="true">
          <IconArrowUpRight />
        </span>
      </span>
    </a>
  );
}
