'use client';

import { useState } from 'react';
import { errorText, postJson } from '@/lib/client/http';

type Method = 'card' | 'yappy' | 'ach';

const METHODS: { id: Method; title: string; hint: string }[] = [
  { id: 'card', title: 'Tarjeta', hint: 'Débito o crédito. Pago inmediato.' },
  { id: 'yappy', title: 'Yappy', hint: 'Transfieres y subes el comprobante (15 min).' },
  { id: 'ach', title: 'ACH', hint: 'Transferencia bancaria y comprobante (15 min).' },
];

export default function BuyButton({ listingId, total }: { listingId: string; total: string }) {
  const [method, setMethod] = useState<Method>('card');
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

  const pay = () =>
    method === 'card'
      ? start('/api/checkout', { listingId }, (d) => (typeof d.checkoutUrl === 'string' ? d.checkoutUrl : null))
      : start('/api/orders/manual', { listingId, paymentMethod: method }, (d) =>
          typeof d.orderId === 'string' ? `/pago-manual/${d.orderId}` : null,
        );

  return (
    <div className="stack">
      {error ? <p role="alert" className="error">{error}</p> : null}
      <fieldset className="method-picker">
        <legend>Método de pago</legend>
        {METHODS.map((m) => (
          <label key={m.id} className={`method-option${method === m.id ? ' selected' : ''}`}>
            <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
            <span className="method-title">{m.title}</span>
            <span className="method-hint">{m.hint}</span>
          </label>
        ))}
      </fieldset>
      <button className="btn block" type="button" onClick={pay} disabled={busy}>
        {busy ? 'Preparando el pago…' : method === 'card' ? `Pagar ${total}` : `Continuar con ${method === 'yappy' ? 'Yappy' : 'ACH'} · ${total}`}
      </button>
    </div>
  );
}
