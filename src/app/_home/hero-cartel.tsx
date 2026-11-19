import { Suspense, type ReactNode } from 'react';
import { splitHeadline } from '@/lib/ui/headline';
import HeroVideo from './hero-video';
import { ticketCountLabel, type HomeData } from './view-model';
import './hero-cartel.css';

/** Home poster: real background loop, the featured event's name set huge, and its cheapest price. */
export default function HeroCartel({ data }: { data: Promise<HomeData> }) {
  return (
    <section className="hero-cartel" aria-labelledby="hero-cartel-title">
      <HeroVideo src="/media/home/hero.mp4" poster="/media/home/hero.jpg" />
      <div className="hero-cartel-shade" aria-hidden="true" />
      <div className="hero-cartel-inner container">
        <Suspense fallback={<HeroCopy lines={['CARTELERA', 'DE REVENTA']} />}>
          <HeroContent data={data} />
        </Suspense>
      </div>
    </section>
  );
}

async function HeroContent({ data }: { data: Promise<HomeData> }) {
  const { hero } = await data;
  if (!hero) {
    return (
      <HeroCopy lines={['CARTELERA', 'DE REVENTA']}>
        <p className="hero-cartel-note">Cuando el equipo publique un evento, lo verás aquí.</p>
        <a className="hero-cartel-cta" href="/vender">Vender una entrada</a>
      </HeroCopy>
    );
  }
  const onSale = hero.count > 0 && hero.from !== null;
  return (
    <HeroCopy lines={splitHeadline(hero.name)} fullName={hero.name} eyebrow={`${hero.dateShort} · ${hero.venue}`} dateTime={hero.date.iso}>
      {onSale ? (
        <>
          <p className="hero-cartel-count">{ticketCountLabel(hero.count)} desde</p>
          <p className="hero-cartel-price">{hero.from}</p>
          <p className="hero-cartel-note">Pagas aquí y el vendedor cobra cuando ya entraste.</p>
          <a className="hero-cartel-cta" href={`/eventos/${hero.id}`}>Ver entradas</a>
        </>
      ) : (
        <>
          <p className="hero-cartel-note">Todavía no hay entradas a la venta para este evento.</p>
          <a className="hero-cartel-cta" href="/eventos">Ver la cartelera</a>
        </>
      )}
    </HeroCopy>
  );
}

function HeroCopy({
  lines,
  fullName,
  eyebrow,
  dateTime,
  children,
}: {
  lines: [string, string];
  fullName?: string;
  eyebrow?: string;
  dateTime?: string;
  children?: ReactNode;
}) {
  return (
    <div className="hero-cartel-grid">
      <div className="hero-cartel-head">
        {eyebrow ? (
          <p className="hero-cartel-eyebrow">
            <time dateTime={dateTime}>{eyebrow}</time>
          </p>
        ) : null}
        <h1 id="hero-cartel-title" className="hero-cartel-title" aria-label={fullName}>
          {fullName ? <span className="visually-hidden">{fullName}</span> : null}
          <span className="hero-cartel-mask" aria-hidden={fullName ? 'true' : undefined}>
            <span className="hero-cartel-line">{lines[0]}</span>
          </span>
          {lines[1] ? (
            <span className="hero-cartel-mask" aria-hidden={fullName ? 'true' : undefined}>
              <span className="hero-cartel-line is-accent">{lines[1]}</span>
            </span>
          ) : null}
        </h1>
      </div>
      {children ? <div className="hero-cartel-side">{children}</div> : null}
    </div>
  );
}
