'use client';

import { useState } from 'react';
import { errorText, postJson } from '@/lib/client/http';

export default function BuyButton({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    const r = await postJson('/api/checkout', { listingId });
    if (r.ok && typeof r.data.checkoutUrl === 'string') {
      window.location.assign(r.data.checkoutUrl);
      return;
    }
    setBusy(false);
    if (r.status === 401) window.location.assign(`/ingresar?next=${encodeURIComponent(`/comprar/${listingId}`)}`);
    else setError(errorText(r));
  }

  return (
    <div className="stack">
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn block" type="button" onClick={buy} disabled={busy}>
        {busy ? 'Preparando el pago…' : 'Pagar de forma protegida'}
      </button>
    </div>
  );
}
