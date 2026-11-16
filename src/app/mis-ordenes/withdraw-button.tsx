'use client';

import { useState } from 'react';
import { deleteRequest, errorText } from '@/lib/client/http';

export default function WithdrawButton({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!window.confirm('¿Retirar esta publicación?')) return;
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
      <button className="btn secondary" type="button" onClick={withdraw} disabled={busy}>Retirar</button>
      {error ? <p role="alert" className="error">{error}</p> : null}
    </div>
  );
}
