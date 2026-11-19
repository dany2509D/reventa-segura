import type { MetadataRoute } from 'next';
import { ROBOTS_DISALLOW } from '@/lib/seo/private-paths';
import { absoluteUrl, isSiteUrlConfigured } from '@/lib/site/site-config';

// Read per request: SITE_URL can change without a rebuild.
export const dynamic = 'force-dynamic';

/**
 * robots.txt. Public pages are open; accounts, checkout, orders, admin and the API are not (see
 * src/lib/seo/private-paths.ts). On a deployment with no configured address (a local run), nothing
 * is advertised: a sitemap pointing at localhost would only confuse a crawler.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ROBOTS_DISALLOW }],
    ...(isSiteUrlConfigured() ? { sitemap: absoluteUrl('/sitemap.xml') } : {}),
  };
}
