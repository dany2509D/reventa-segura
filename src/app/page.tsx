import { Suspense } from 'react';
import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { IconArrowDown, IconArrowRight } from './_components/icons';
import { FadeInUp } from './_components/motion-primitives';
import TrustBar from './_home/trust-bar';
import EventAgenda from './_home/event-agenda';
import FeaturedEvents from './_home/featured-events';
import { HeroSearch, HeroStats, HeroTicket } from './_home/hero-parts';
import HeroVisual from './_home/hero-visual';
import HowItWorks from './_home/how-it-works';
import { SearchProvider } from './_home/search-context';
import SellBand from './_home/sell-band';
import { SearchSkeleton, SectionsSkeleton, StatsSkeleton, TicketSkeleton } from './_home/skeletons';
import { buildHomeData, type HomeData } from './_home/view-model';
import './_home/home.css';

export const dynamic = 'force-dynamic';

async function loadHome(): Promise<HomeData> {
  return buildHomeData(await upcomingEvents(getDb()));
}

async function Agenda({ data }: { data: Promise<HomeData> }) {
  const { events } = await data;
  return <EventAgenda events={events} />;
}

/**
 * Home. A Server Component: the query starts here and is NOT awaited, so the hero's headline is
 * sent at once and the data-dependent parts (search, hero ticket, featured cards, agenda) stream
 * in behind skeletons of the same size. Only the search box, the agenda filter and three small
 * motion helpers are Client Components.
 */
export default function Home() {
  const data = loadHome();
  // The same promise is awaited by several boundaries; a rejection is handled there (it reaches
  // error.tsx). This no-op handler only keeps Node from flagging it as unhandled meanwhile.
  data.catch(() => {});

  return (
    <main className="home">
      <SearchProvider>
        <section className="hero container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-badge hero-in hero-in-0">
              <span className="pulse-dot" aria-hidden="true" />
              Reventa 100% verificada <span aria-hidden="true">•</span> Protección antifraude en Panamá
            </p>
            <h1 id="hero-title" className="hero-title">
              <span className="line">
                <span className="line-in line-in-0">Tu próximo</span>
              </span>{' '}
              <span className="line">
                <span className="line-in line-in-1">evento empieza</span>
              </span>{' '}
              <span className="line">
                <span className="line-in line-in-2">
                  <mark>aquí.</mark>
                </span>
              </span>
            </h1>
            <p className="hero-sub hero-in hero-in-1">
              Descubre entradas de reventa para conciertos, partidos y más. Tu pago se retiene y el vendedor cobra después del evento, no
              antes.
            </p>
            <FadeInUp className="hero-ctas" delay={0.3}>
              <a className="btn lg hero-cta-primary" href="#eventos">
                Explorar eventos
                <IconArrowRight />
              </a>
              <a className="btn lg hero-cta-glass" href="/vender">
                Vender mis entradas
              </a>
            </FadeInUp>
            <div className="hero-search hero-in hero-in-2">
              <Suspense fallback={<SearchSkeleton />}>
                <HeroSearch data={data} />
              </Suspense>
            </div>
            <div className="hero-foot hero-in hero-in-3">
              <Suspense fallback={<StatsSkeleton />}>
                <HeroStats data={data} />
              </Suspense>
              <a className="hero-how" href="#como-funciona">
                Cómo funciona
                <IconArrowDown />
              </a>
            </div>
          </div>
          <HeroVisual>
            <Suspense fallback={<TicketSkeleton />}>
              <HeroTicket data={data} />
            </Suspense>
          </HeroVisual>
        </section>

        <TrustBar />

        <Suspense fallback={<SectionsSkeleton />}>
          <FeaturedEvents data={data} />
          <Agenda data={data} />
        </Suspense>
      </SearchProvider>

      <HowItWorks />
      <SellBand />
    </main>
  );
}
