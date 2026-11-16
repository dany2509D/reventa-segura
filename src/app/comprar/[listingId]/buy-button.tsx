'use client';

import { useState } from 'react';
import { errorText, postJson } from '@/lib/client/http';

export default function BuyButton({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(url: string, body: object, onOk: (data: Record<string, unknown>) => string | null) {
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    const next = r.ok ? onOk(r.data) : null;
    if (next) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    if (r.status === 401) window.location.assign(`/ingresar?next=${encodeURIComponent(`/comprar/${listingId}`)}`);
    else setError(errorText(r));
  }

  const buy = () =>
    start('/api/checkout', { listingId }, (d) => (typeof d.checkoutUrl === 'string' ? d.checkoutUrl : null));
  const buyManual = (paymentMethod: 'yappy' | 'ach') =>
    start('/api/orders/manual', { listingId, paymentMethod }, (d) =>
      typeof d.orderId === 'string' ? `/pago-manual/${d.orderId}` : null,
    );

  return (
    <div className="stack">
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn block" type="button" onClick={buy} disabled={busy}>
        {busy ? 'Preparando el pago…' : 'Pagar de forma protegida'}
      </button>
      <p className="hint">O paga por transferencia y sube tu comprobante (15 minutos para completarlo):</p>
      <div className="actions">
        <button className="btn secondary" type="button" onClick={() => buyManual('yappy')} disabled={busy}>
          Pagar con Yappy
        </button>
        <button className="btn secondary" type="button" onClick={() => buyManual('ach')} disabled={busy}>
          Pagar con ACH
        </button>
      </div>
    </div>
  );
}
