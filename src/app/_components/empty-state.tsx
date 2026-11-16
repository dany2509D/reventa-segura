import type { ReactNode } from 'react';
import { TicketMark } from './icons';

/** Empty state: a dashed ticket outline, one clear sentence and (optionally) the way forward. */
export default function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <TicketMark />
      {children}
    </div>
  );
}
