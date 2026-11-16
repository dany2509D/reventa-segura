import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import SiteHeader from './_components/site-header';
import RegisterSw from './_components/register-sw';

export const metadata: Metadata = {
  title: { default: 'Reventa Segura', template: '%s · Reventa Segura' },
  description: 'Reventa de entradas en Panamá con pago protegido: el vendedor cobra cuando tú entras al evento.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Reventa Segura',
  appleWebApp: { capable: true, title: 'Reventa Segura', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SiteHeader />
        {children}
        <RegisterSw />
      </body>
    </html>
  );
}
