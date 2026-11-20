/**
 * Per-page metadata in one place, so every public page has a unique title and description, its own
 * canonical URL and the same social preview (Open Graph + Twitter Card) without repeating the shape.
 * Relative URLs resolve against `metadataBase` (the root layout sets it from SITE_URL).
 *
 * Note for Next's metadata merging: a page's `openGraph` / `twitter` REPLACE the layout's wholesale
 * (they are not merged field by field), which is why the image is part of what this returns.
 */
import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site/site-config';

/** The default preview card (public/og-default.png, 1200×630): shown when a link is shared. */
export const OG_IMAGE = {
  url: '/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Reventa Segura: entradas de reventa en Panamá con pago protegido',
} as const;

export function pageMetadata(opts: {
  /** Page title WITHOUT the site name: the layout's template appends " · Reventa Segura". */
  title: string;
  /** Use `title` exactly as given (no template suffix): for the home, whose title already carries the name. */
  absoluteTitle?: boolean;
  /** 120–160 characters reads best in search results. */
  description: string;
  /** Path of this page, starting with "/": the canonical URL. */
  path: string;
  type?: 'website' | 'article';
}): Metadata {
  const shareTitle = opts.absoluteTitle ? opts.title : `${opts.title} · ${SITE_NAME}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: opts.type ?? 'website',
      locale: 'es_PA',
      siteName: SITE_NAME,
      title: shareTitle,
      description: opts.description,
      url: opts.path,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description: opts.description, images: [OG_IMAGE.url] },
  };
}
