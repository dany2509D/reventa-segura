'use client';

import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/ui/theme';

/**
 * Pre-paint theme bootstrap (see src/lib/ui/theme.ts). A <script> element only runs when it comes
 * from the server HTML; React 19 warns when it renders one on the client ("Encountered a script
 * tag while rendering React component"). So it is emitted during SSR only and the client renders
 * nothing: the browser already executed the server-emitted copy before first paint.
 * The nonce (minted per response by src/proxy.ts) lets it through the Content-Security-Policy.
 * The source is a constant: nothing from the request is interpolated into it.
 */
export default function ThemeScript({ nonce }: { nonce?: string }) {
  if (typeof window !== 'undefined') return null;
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />;
}
