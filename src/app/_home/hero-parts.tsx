import EventSearch from './event-search';
import { type HomeData } from './view-model';

// The data-dependent parts of the hero. Each one awaits the same promise inside its own Suspense
// boundary (see page.tsx), so the headline is on screen before the events query answers.

export async function HeroSearch({
  data,
  mode = 'navigate',
  initialQuery = '',
}: {
  data: Promise<HomeData>;
  mode?: 'navigate' | 'filter';
  initialQuery?: string;
}) {
  const { events } = await data;
  return <EventSearch events={events} mode={mode} initialQuery={initialQuery} />;
}

/** Real figures only: how many upcoming events and verified listings there are right now. */
export async function HeroStats({ data }: { data: Promise<HomeData> }) {
  const { totals } = await data;
  if (totals.events === 0) return <p className="hero-stats">Todavía no hay eventos publicados.</p>;
  return (
    <div className="hero-metrics">
      <div className="hero-metric">
        <strong className="hero-metric-val">{String(totals.events).padStart(2, '0')} eventos</strong>
        <span className="hero-metric-lbl">Cartelera activa</span>
      </div>
      <span className="hero-metric-sep" aria-hidden="true" />
      <div className="hero-metric">
        <strong className="hero-metric-val is-blue">{String(totals.listings).padStart(2, '0')} disp.</strong>
        <span className="hero-metric-lbl">Con retención escrow</span>
      </div>
    </div>
  );
}
