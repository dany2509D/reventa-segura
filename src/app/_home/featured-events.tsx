import { splitHeadline } from '@/lib/ui/headline';
import { IconArrowRight } from '../_components/icons';
import { type EventView, type HomeData } from './view-model';

function eventKind(name: string, venue: string): string {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const v = venue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(vs|amistoso|futbol|copa|seleccion|clasico)\b/.test(n) || /rod carew/.test(v)) return 'Deportes';
  if (/\b(gala|orquesta|sinfonica)\b/.test(n)) return 'Gala';
  if (/\b(festival|fest)\b/.test(n)) return 'Festival';
  if (/\b(jazz)\b/.test(n)) return 'Jazz';
  if (/\b(teatro|bernarda|obra)\b/.test(n)) return v.startsWith('teatro') ? 'Obra' : 'Teatro';
  return 'Concierto';
}

/**
 * Seasonal typographic poster wall ("Esta temporada"): up to three 3:4 flat-colour posters
 * cycling crimson, warm paper and cobalt with Archivo Black display type.
 */
export default async function FeaturedEvents({ data }: { data: Promise<HomeData> }) {
  const { featured, events } = await data;
  if (featured.length === 0) return null;
  return (
    <section className="section season-section container" aria-labelledby="temporada-title">
      <header className="season-head reveal">
        <h2 id="temporada-title" className="season-title">
          ESTA TEMPORADA
        </h2>
        {events.length > featured.length ? (
          <a className="section-link" href="/eventos">
            Ver los {events.length} eventos
            <IconArrowRight />
          </a>
        ) : null}
      </header>
      <div className="season-grid">
        {featured.map((event, i) => (
          <FeatureCard key={event.id} event={event} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ event, index }: { event: EventView; index: number }) {
  const [line1, line2] = splitHeadline(event.name);
  const kind = eventKind(event.name, event.venue);
  const tone = index % 3;
  return (
    <a className={`season-card season-card--${tone} reveal reveal-${index}`} href={`/eventos/${event.id}`}>
      <p className="season-kicker">
        {kind} · {event.venue}
      </p>
      <h3 className="season-name" aria-label={event.name}>
        <span className="visually-hidden">{event.name}</span>
        <span className="season-name-lines" aria-hidden="true">
          {line1}
          {line2 ? (
            <>
              <br />
              {line2}
            </>
          ) : null}
        </span>
      </h3>
      <div className="season-foot">
        <time className="season-date" dateTime={event.date.iso}>
          {event.dateShort}
        </time>
        {event.from ? (
          <span className="season-price">{event.from}</span>
        ) : (
          <span className="season-none">{event.resaleProhibited ? 'Sin reventa' : 'Sin entradas'}</span>
        )}
      </div>
    </a>
  );
}
