import type { ReactNode } from 'react';
import { TicketMark } from './icons';

/** Empty state: calm centered ticket mark, one clear sentence and (optionally) the way forward. */
export default function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-badge" aria-hidden="true">
        <TicketMark />
      </div>
      {children}
    </div>
  );
}
