'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** A navigation link that highlights itself (aria-current) when the current path is one of `match`. */
export default function NavLink({ href, match, children }: { href: string; match?: string[]; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const active = (match ?? [href]).some((p) =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`),
  );
  return (
    <a href={href} className="nav-item" aria-current={active ? 'page' : undefined}>
      {children}
    </a>
  );
}
