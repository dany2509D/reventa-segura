'use client';

import { useState } from 'react';
import { deleteRequest, errorText } from '@/lib/client/http';
import { ConfirmDialog } from '../_components/confirm-dialog';

export default function WithdrawButton({ listingId, eventName }: { listingId: string; eventName?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const r = await deleteRequest(`/api/listings/${listingId}`);
    if (r.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setError(errorText(r));
  }

  return (
    <div>
      <button className="btn secondary" type="button" onClick={() => setOpen(true)} disabled={busy} aria-busy={busy || undefined}>
        {busy ? 'Retirando…' : 'Retirar'}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={withdraw}
        title="¿Retirar esta publicación?"
        description={
          eventName
            ? `Tu entrada para ${eventName} dejará de mostrarse a los compradores.`
            : 'Tu entrada dejará de mostrarse a los compradores.'
        }
        confirmLabel="Retirar publicación"
        tone="danger"
        busy={busy}
      />
      {error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
