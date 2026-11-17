import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import Script from 'next/script';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
import './globals.css';
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLORS } from '@/lib/ui/theme';
import LinkEnhancer from './_components/link-enhancer';
import RegisterSw from './_components/register-sw';
import RevealObserver from './_components/reveal-observer';
import SiteFooter from './_components/site-footer';
import SiteHeader, { TabBar } from './_components/site-header';

export const metadata: Metadata = {
  title: { default: 'Reventa Segura · Entradas de reventa en Panamá', template: '%s · Reventa Segura' },
  description:
    'Reventa de entradas entre personas en Panamá. El pago se retiene y el vendedor cobra después del evento.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Reventa Segura',
  appleWebApp: { capable: true, title: 'Reventa Segura', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Light by default; the pre-paint bootstrap and the theme selector update it for the dark theme.
  themeColor: THEME_COLORS.light,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request: the CSP nonce (src/proxy.ts) is new on each response, and a
  // page prerendered at build time would carry scripts without it, which the browser blocks.
  await connection();
  // Nonce minted per response by src/proxy.ts; the CSP blocks inline scripts without it.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // data-theme is rewritten before the first paint by <ThemeScript /> (stored preference), hence
    // suppressHydrationWarning on this one element. Fonts: Geist Sans and Geist Mono, self-hosted
    // by next/font from the `geist` package (no request to a font CDN; font-src stays 'self').
    <html lang="es" data-theme="light" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <Script id="theme-bootstrap" strategy="beforeInteractive" nonce={nonce}>
        {THEME_BOOTSTRAP_SCRIPT}
      </Script>
      <body>
        <SiteHeader />
        <div id="contenido" tabIndex={-1} />
        {children}
        <SiteFooter />
        <TabBar />
        <RevealObserver />
        <LinkEnhancer />
        <RegisterSw />
      </body>
    </html>
  );
}
