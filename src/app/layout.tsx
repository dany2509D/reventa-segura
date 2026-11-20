import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { GeistSans } from 'geist/font/sans';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';
import './a11y.css';

// Display face for the home poster headlines. Self-hosted (no font CDN): the CSP allows font-src 'self' only.
const display = localFont({
  src: './fonts/ArchivoBlack-Regular.ttf',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-display',
  fallback: ['Arial Black', 'Impact', 'sans-serif'],
});
import { OG_IMAGE } from '@/lib/seo/metadata';
import { organizationLd, serializeJsonLd, websiteLd } from '@/lib/seo/json-ld';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  analyticsId,
  businessInfo,
  siteUrl,
  siteVerification,
  socialLinks,
} from '@/lib/site/site-config';
import { THEME_COLORS } from '@/lib/ui/theme';
import Analytics from './_components/analytics';
import CookieConsent from './_components/cookie-consent';
import LinkEnhancer from './_components/link-enhancer';
import FormValidation from './_components/form-validation';
import RegisterSw from './_components/register-sw';
import RevealObserver from './_components/reveal-observer';
import SiteFooter from './_components/site-footer';
import SiteHeader, { TabBar } from './_components/site-header';
import ThemeScript from './_components/theme-script';
import ThemeSync from './_components/theme-sync';
import WhatsAppButton from './_components/whatsapp-button';

const DEFAULT_TITLE = `${SITE_NAME} · Entradas de reventa en Panamá`;

/**
 * Site-wide defaults. Every public page overrides title, description, canonical and the social card
 * with pageMetadata() (src/lib/seo/metadata.ts); these cover the pages that do not. There is NO
 * canonical here on purpose: a canonical in the root layout would point every page at the home.
 * Built per request so SITE_URL (the canonical origin) and the verification codes can change
 * without a rebuild.
 */
export function generateMetadata(): Metadata {
  const { google, bing } = siteVerification();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: DEFAULT_TITLE, template: `%s · ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    manifest: '/manifest.webmanifest',
    applicationName: SITE_NAME,
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
    // The full set: .ico for old browsers and crawlers, SVG for modern tabs, PNGs for Android and iOS.
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    openGraph: {
      type: 'website',
      locale: 'es_PA',
      siteName: SITE_NAME,
      title: DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: DEFAULT_TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE.url] },
    verification: { ...(google ? { google } : {}), ...(bing ? { other: { 'msvalidate.01': bing } } : {}) },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Pre-paint bootstrap (<ThemeScript />) resolves exact light/dark chrome colour from system preference.
  themeColor: THEME_COLORS.light,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request: the CSP nonce (src/proxy.ts) is new on each response, and a
  // page prerendered at build time would carry scripts without it, which the browser blocks.
  await connection();
  // Nonce minted per response by src/proxy.ts; the CSP blocks inline scripts without it.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const business = businessInfo();
  const gaId = analyticsId();
  // Structured data for the whole site (who we are). It is data, not a script: the CSP does not block it.
  const siteJsonLd = serializeJsonLd([
    organizationLd({ legalName: business.legalName, email: business.email, phone: business.phone, social: socialLinks() }),
    websiteLd(),
  ]);
  return (
    // data-theme is resolved before first paint by <ThemeScript /> matching the OS appearance
    // (suppressHydrationWarning covers that root attribute). Text: Geist Sans; poster headlines: Archivo Black.
    <html lang="es" className={`${GeistSans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <SiteHeader />
        <div id="contenido" tabIndex={-1} />
        {children}
        <SiteFooter />
        <TabBar />
        <ThemeSync />
        <WhatsAppButton />
        <CookieConsent analyticsAvailable={gaId !== undefined} />
        <Analytics measurementId={gaId} />
        <RevealObserver />
        <LinkEnhancer />
        <FormValidation />
        <RegisterSw />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd }} />
      </body>
    </html>
  );
}
