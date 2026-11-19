'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isActivePath } from '@/lib/ui/nav';

type Props = {
  href: string;
  /** Path prefixes that count as "this section" (defaults to the link's own href). */
  match?: string[];
  /** Match exact pathname only (useful for section roots like /admin). */
  exact?: boolean;
  /** Render the sliding view-transition `.nav-pill` inside the active link. */
  pill?: boolean;
  /** 'nav-item' in the header, 'tab-item' in the mobile tab bar. */
  className?: string;
  children: ReactNode;
};

/**
 * A navigation link that marks itself (aria-current) when the current path is one of `match`.
 * The active link renders the indicator pill; it carries a view-transition-name (globals.css),
 * so the browser slides it from the previous page's active link to this one.
 */
export default function NavLink({ href, match, exact = false, pill = true, className = 'nav-item', children }: Props) {
  const pathname = usePathname() ?? '';
  const active = isActivePath(pathname, match ?? [href], exact);
  return (
    <a href={href} className={className} aria-current={active ? 'page' : undefined}>
      {active && pill ? <span className="nav-pill" aria-hidden="true" /> : null}
      {children}
    </a>
  );
}
