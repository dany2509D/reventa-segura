import type { ReactNode } from 'react';
import { IconChevronLeft } from './icons';

/** Inner-page header row: round back chevron + where it goes. */
export default function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="back-link">
      <span className="back-chev" aria-hidden="true">
        <IconChevronLeft />
      </span>
      <span>{children}</span>
    </a>
  );
}
