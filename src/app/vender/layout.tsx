import type { ReactNode } from 'react';
import { SELL_TABS } from '@/lib/ui/nav';
import SectionNav from '../_components/section-nav';
import SectionShell from '../_components/section-shell';

/**
 * The seller's area. Each tab page calls requireUser with its own path, so after signing in the
 * visitor returns to the tab they asked for; the phone check stays on the publish page only.
 */
export default function SellLayout({ children }: { children: ReactNode }) {
  return (
    <SectionShell
      tone="vender"
      eyebrow="Tu espacio de vendedor"
      title="Vender"
      lead="Publica entradas, sigue su revisión y cobra después del evento."
      nav={<SectionNav label="Secciones de venta" tabs={SELL_TABS} />}
    >
      {children}
    </SectionShell>
  );
}
