'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = {
  href: string;
  /** Path prefixes that count as "this section" (defaults to the link's own href). */
  match?: string[];
  /** 'nav-item' in the header, 'tab-item' in the mobile tab bar. */
  className?: string;
  children: ReactNode;
};

/**
 * A navigation link that marks itself (aria-current) when the current path is one of `match`.
 * The active link renders the indicator pill; it carries a view-transition-name (globals.css),
 * so the browser slides it from the previous page's active link to this one.
 */
export default function NavLink({ href, match, className = 'nav-item', children }: Props) {
  const pathname = usePathname() ?? '';
  const active = (match ?? [href]).some((p) =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`),
  );
  return (
    <a href={href} className={className} aria-current={active ? 'page' : undefined}>
      {active ? <span className="nav-pill" aria-hidden="true" /> : null}
      {children}
    </a>
  );
}
