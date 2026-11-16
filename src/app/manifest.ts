import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@/lib/ui/theme';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reventa Segura',
    short_name: 'Reventa Segura',
    description: 'Reventa de entradas entre personas en Panamá. El pago se retiene y el vendedor cobra después del evento.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The app opens in the light theme by default (the stored preference applies once it loads).
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
