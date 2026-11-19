import { escrowStages } from '@/lib/account/escrow';
import type { OrderState } from '@/lib/orders/state-machine';

/** The order card's escrow progress. Decorative: the status chip next to it carries the meaning. */
export default function EscrowTrack({ state, labels }: { state: OrderState; labels: readonly [string, string, string] }) {
  const stages = escrowStages(state);
  if (!stages) return null;
  return (
    <div className="escrow-track" aria-hidden="true">
      {stages.map((cls, i) => (
        <div key={labels[i]} className={`escrow-stage ${cls}`}>
          <span>{labels[i]}</span>
          <span className="escrow-bar" />
        </div>
      ))}
    </div>
  );
}
