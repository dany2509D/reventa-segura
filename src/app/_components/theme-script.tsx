import { headers } from 'next/headers';
import Script from 'next/script';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/ui/theme';

/**
 * Pre-paint bootstrap, rendered in <head>: applies the stored theme before the first paint (no
 * flash) and arms the progressive-enhancement flags (see src/lib/ui/theme.ts for what it sets).
 * The Content-Security-Policy forbids inline scripts without the request's nonce, so it carries
 * the nonce the proxy minted for this response (src/proxy.ts hands it over in `x-nonce`).
 * The source is a constant: nothing from the request is ever interpolated into it.
 */
export default async function ThemeScript() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <Script
      id="theme-bootstrap"
      strategy="beforeInteractive"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
