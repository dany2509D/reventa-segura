import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { pageMetadata } from '@/lib/seo/metadata';
import SectionShell from '../_components/section-shell';
import EventAgenda from '../_home/event-agenda';
import EventSearch from '../_home/event-search';
import { SearchProvider } from '../_home/search-context';
import { buildHomeData, eventCountLabel, ticketCountLabel } from '../_home/view-model';
import '../_home/home.css';

export const metadata = pageMetadata({
  title: 'Eventos en Panamá',
  description: 'Cartelera de conciertos, partidos y obras en Panamá con entradas de reventa verificadas y pago retenido hasta después del evento.',
  path: '/eventos',
});
export const dynamic = 'force-dynamic';

export default async function EventsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, rows] = await Promise.all([searchParams, upcomingEvents(getDb())]);
  const initialQuery = typeof q === 'string' ? q.trim() : '';
  const { events, totals } = buildHomeData(rows);

  return (
    <SearchProvider initialQuery={initialQuery}>
      <SectionShell
        tone="eventos"
        eyebrow={`Cartelera · ${eventCountLabel(totals.events)} · ${ticketCountLabel(totals.listings)}`}
        title="Eventos en Panamá"
        titleId="eventos-title"
        lead="Explora conciertos, partidos y obras con entregas verificadas y dinero retenido en escrow."
        aside={<EventSearch events={events} mode="filter" initialQuery={initialQuery} />}
      >
        <EventAgenda events={events} defaultView="grid" showViewToggle showHeader={false} />
      </SectionShell>
    </SearchProvider>
  );
}
