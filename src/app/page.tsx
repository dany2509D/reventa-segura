import type { Metadata } from 'next';
import { Suspense } from 'react';
import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { faqLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/metadata';
import { faqItems } from '@/lib/site/faq';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site/site-config';
import AppPortals from './_home/app-portals';
import Faq from './_home/faq';
import FeaturedEvents from './_home/featured-events';
import Garantia from './_home/garantia';
import HeroCartel from './_home/hero-cartel';
import { HeroSearch } from './_home/hero-parts';
import { SearchProvider } from './_home/search-context';
import { SearchSkeleton, SectionsSkeleton } from './_home/skeletons';
import { buildHomeData, type HomeData } from './_home/view-model';
import './_home/home.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: `${SITE_NAME} · ${SITE_TAGLINE}`,
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: '/',
});

async function loadHome(): Promise<HomeData> {
  return buildHomeData(await upcomingEvents(getDb()));
}

/**
 * Inicio (`/`): opens with the featured event's dark typographic poster (Cartel nocturno),
 * followed by catalog search, the seasonal poster wall, guarantee band and section portals.
 */
export default function Home() {
  const data = loadHome();
  data.catch(() => {});

  return (
    <main className="home">
      <SearchProvider>
        <HeroCartel data={data} />
        <div className="hero-search-band container">
          <Suspense fallback={<SearchSkeleton />}>
            <HeroSearch data={data} mode="navigate" />
          </Suspense>
        </div>

        <Suspense fallback={<SectionsSkeleton />}>
          <FeaturedEvents data={data} />
          <Garantia />
          <AppPortals data={data} />
        </Suspense>
      </SearchProvider>
      <Faq />
      {/* FAQPage structured data: the same questions and answers the Faq section shows. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqLd(faqItems())) }} />
    </main>
  );
}
