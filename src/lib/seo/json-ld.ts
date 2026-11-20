/**
 * Structured data (schema.org JSON-LD). Pure builders plus the serializer the <script> tag uses.
 * A JSON-LD block is data, not code: the browser never executes it, so the nonce CSP does not
 * apply to it. The serializer still escapes `<` so a name containing "</script>" can never close
 * the tag early.
 */
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, type SocialLink } from '@/lib/site/site-config';

export type JsonLd = Record<string, unknown>;

export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  // `<` could close the tag ("</script>"); U+2028/2029 are line breaks inside a JavaScript string.
  return JSON.stringify(data)
    .replaceAll('<', String.raw`\u003c`)
    .replaceAll(String.fromCharCode(0x2028), String.raw`\u2028`)
    .replaceAll(String.fromCharCode(0x2029), String.raw`\u2029`);
}

export function organizationLd(opts: {
  legalName?: string;
  email?: string;
  phone?: string;
  social: SocialLink[];
  env?: Readonly<Record<string, string | undefined>>;
}): JsonLd {
  const url = absoluteUrl('/', opts.env);
  const org: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}#organization`,
    name: SITE_NAME,
    url,
    logo: absoluteUrl('/icons/icon-512.png', opts.env),
  };
  if (opts.legalName) org.legalName = opts.legalName;
  if (opts.social.length) org.sameAs = opts.social.map((s) => s.url);
  if (opts.email || opts.phone) {
    org.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      areaServed: 'PA',
      availableLanguage: 'es',
      ...(opts.email ? { email: opts.email } : {}),
      ...(opts.phone ? { telephone: opts.phone } : {}),
    };
  }
  return org;
}

export function websiteLd(env?: Readonly<Record<string, string | undefined>>): JsonLd {
  const url = absoluteUrl('/', env);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name: SITE_NAME,
    url,
    description: SITE_DESCRIPTION,
    inLanguage: 'es-PA',
    publisher: { '@id': `${url}#organization` },
  };
}

export function faqLd(items: readonly { question: string; answer: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * One event page. Only facts the site really has: name, start, venue, link and whether tickets are
 * on sale. No price or "offers": the price depends on each seller's listing, and structured data
 * must never promise what the page does not show.
 */
export function eventLd(opts: {
  id: string;
  name: string;
  startsAt: Date;
  venue: string;
  env?: Readonly<Record<string, string | undefined>>;
}): JsonLd {
  const url = absoluteUrl(`/eventos/${opts.id}`, opts.env);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${url}#event`,
    name: opts.name,
    url,
    startDate: opts.startsAt.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: opts.venue, address: { '@type': 'PostalAddress', addressCountry: 'PA' } },
    inLanguage: 'es-PA',
  };
}
