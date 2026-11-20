import type { MetadataRoute } from 'next';
import { upcomingEvents } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { errorName, log } from '@/lib/observability/log';
import { absoluteUrl } from '@/lib/site/site-config';

// Events come and go: build the list per request, never at build time.
export const dynamic = 'force-dynamic';

const STATIC_PAGES: { path: string; changeFrequency: 'daily' | 'monthly' | 'yearly'; priority: number }[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/eventos', changeFrequency: 'daily', priority: 0.9 },
  { path: '/como-funciona', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacidad', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terminos', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/reembolsos', changeFrequency: 'yearly', priority: 0.4 },
];

/**
 * sitemap.xml: the home, the legal pages and every upcoming event that is on sale. Private pages
 * (account, checkout, admin) are never listed. If the database cannot be reached the static pages
 * are still served, so a crawler never gets an error for the sitemap itself.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // No <lastmod>: the pages carry no real modification date, and a made-up one teaches crawlers to ignore it.
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  try {
    for (const event of await upcomingEvents(getDb())) {
      // Events that forbid resale have no tickets to show; they stay out of the index.
      if (event.resaleProhibited) continue;
      entries.push({ url: absoluteUrl(`/eventos/${event.id}`), changeFrequency: 'daily', priority: 0.8 });
    }
  } catch (e) {
    log('error', 'sitemap events query failed', { error: errorName(e) });
  }
  return entries;
}
