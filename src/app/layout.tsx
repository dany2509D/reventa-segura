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
import { THEME_COLORS } from '@/lib/ui/theme';
import LinkEnhancer from './_components/link-enhancer';
import FormValidation from './_components/form-validation';
import RegisterSw from './_components/register-sw';
import RevealObserver from './_components/reveal-observer';
import SiteFooter from './_components/site-footer';
import SiteHeader, { TabBar } from './_components/site-header';
import ThemeScript from './_components/theme-script';
import ThemeSync from './_components/theme-sync';

export const metadata: Metadata = {
  title: { default: 'Reventa Segura · Entradas de reventa en Panamá', template: '%s · Reventa Segura' },
  description:
    'Reventa de entradas entre personas en Panamá. El pago se retiene y el vendedor cobra después del evento.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Reventa Segura',
  appleWebApp: { capable: true, title: 'Reventa Segura', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

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
        <RevealObserver />
        <LinkEnhancer />
        <FormValidation />
        <RegisterSw />
      </body>
    </html>
  );
}
