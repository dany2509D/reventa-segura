import type { SectionTab } from '@/lib/ui/nav';
import NavLink from './nav-link';
import './section-shell.css';

/** Tabs between the pages of one section. Active state comes from NavLink (aria-current). */
export default function SectionNav({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.exact} pill={false} className="section-tab">
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
