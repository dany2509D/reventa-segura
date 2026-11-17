'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { simulatePaymentAction } from './actions';

type Method = 'card' | 'yappy' | 'nequi' | 'ach';

const METHODS: { id: Method; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: 'card',
    label: 'Tarjeta',
    hint: 'Visa / Mastercard',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></svg>
    ),
  },
  {
    id: 'yappy',
    label: 'Yappy',
    hint: 'Banco General',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
    ),
  },
  {
    id: 'nequi',
    label: 'Nequi',
    hint: 'Panamá',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-7-5 14-3-6-8-1z" /></svg>
    ),
  },
  {
    id: 'ach',
    label: 'ACH',
    hint: 'Transferencia',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>
    ),
  },
];

const PAY_LABEL: Record<Method, string> = {
  card: 'Pagar',
  yappy: 'Ya pagué con Yappy',
  nequi: 'Ya aprobé en Nequi',
  ach: 'Ya hice la transferencia',
};

function formatCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExp(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable: value stays visible and selectable */
    }
  }
  return (
    <div className="gw-copy-row">
      <div>
        <span className="gw-copy-label">{label}</span>
        <span className="gw-copy-value">{value}</span>
      </div>
      <button type="button" className="gw-copy-btn" onClick={copy} aria-label={`Copiar ${label}`}>
        {done ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// Decorative QR-like pattern (not scannable): a deterministic grid plus the three finder squares.
function FakeQr() {
  const n = 21;
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      if (inFinder) continue;
      if (((x * 7 + y * 13 + x * y) % 5) < 2) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  const finder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="var(--surface)" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg className="gw-qr" viewBox={`-1 -1 ${n + 2} ${n + 2}`} role="img" aria-label="Código QR de ejemplo">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="var(--surface)" />
      <g fill="#111318">
        {cells}
        {finder(0, 0)}
        {finder(n - 7, 0)}
        {finder(0, n - 7)}
      </g>
    </svg>
  );
}

export default function Checkout({
  reference,
  totalLabel,
  ticketLabel,
  feeLabel,
}: {
  reference: string;
  totalLabel: string;
  ticketLabel: string;
  feeLabel: string;
}) {
  const [method, setMethod] = useState<Method>('card');
  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [pushSent, setPushSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // Same server action as before; only the optional delay is new. Card fields are never read here.
  function run(outcome: 'paid' | 'failed', delayMs: number) {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      const fd = new FormData();
      fd.set('ref', reference);
      fd.set('outcome', outcome);
      startTransition(() => {
        void simulatePaymentAction(fd);
      });
    }, delayMs);
  }

  const shortRef = reference.length > 18 ? `${reference.slice(0, 18)}…` : reference;

  return (
    <div className="gw-layout">
      <aside className="gw-summary" aria-label="Resumen de la orden">
        <p className="gw-eyebrow">Total a pagar</p>
        <p className="gw-total">{totalLabel}</p>
        <p className="gw-ref">Orden <code>{shortRef}</code></p>
        <dl className="gw-breakdown">
          <div><dt>Boleto</dt><dd>{ticketLabel}</dd></div>
          <div><dt>Cargo por servicio</dt><dd>{feeLabel}</dd></div>
          <div className="gw-breakdown-total"><dt>Total</dt><dd>{totalLabel}</dd></div>
        </dl>
        <p className="gw-secure">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          Conexión cifrada TLS • Entorno Sandbox
        </p>
      </aside>

      <section className="gw-main" aria-label="Método de pago">
        <div role="tablist" aria-label="Método de pago" className="gw-tabs">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              id={`tab-${m.id}`}
              aria-selected={method === m.id}
              aria-controls={`panel-${m.id}`}
              className="gw-tab"
              onClick={() => setMethod(m.id)}
            >
              {m.icon}
              <span className="gw-tab-label">{m.label}</span>
              <span className="gw-tab-hint">{m.hint}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${method}`} aria-labelledby={`tab-${method}`} className="gw-panel">
          {method === 'card' && (
            <div className="gw-fields">
              <div>
                <label htmlFor="gw-holder" className="gw-label">Titular de la tarjeta</label>
                <input id="gw-holder" className="gw-input" type="text" autoComplete="cc-name" placeholder="Ej. Rodolfo Rivera" value={holder} onChange={(e) => setHolder(e.target.value)} />
              </div>
              <div>
                <label htmlFor="gw-number" className="gw-label">Número de la tarjeta</label>
                <div className="gw-input-icon">
                  <input id="gw-number" className="gw-input" type="text" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" maxLength={19} value={number} onChange={(e) => setNumber(formatCard(e.target.value))} />
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                </div>
              </div>
              <div className="gw-row">
                <div>
                  <label htmlFor="gw-exp" className="gw-label">Vencimiento</label>
                  <input id="gw-exp" className="gw-input" type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={5} value={exp} onChange={(e) => setExp(formatExp(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="gw-cvv" className="gw-label">CVV</label>
                  <input id="gw-cvv" className="gw-input" type="text" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                </div>
              </div>
              <p className="gw-note">Solo visual: en modo de prueba no se guarda ni se envía ningún dato de tarjeta.</p>
            </div>
          )}

          {method === 'yappy' && (
            <div className="gw-fields">
              <div className="gw-yappy">
                <FakeQr />
                <div className="gw-yappy-side">
                  <CopyRow label="Alias Yappy" value="@reventasegura" />
                  <ol className="gw-steps">
                    <li>Abre tu App Banco General</li>
                    <li>Entra a Yappy</li>
                    <li>Escanea el QR o busca el alias</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {method === 'nequi' && (
            <div className="gw-fields">
              <CopyRow label="Celular destino" value="+507 6000-0000" />
              <CopyRow label="Código de referencia" value={shortRef} />
              <button type="button" className="gw-secondary" onClick={() => setPushSent(true)} disabled={pushSent}>
                {pushSent ? 'Solicitud enviada (simulada)' : 'Enviar solicitud push simulada'}
              </button>
              {pushSent && <p className="gw-note" role="status">Revisa la notificación en tu app Nequi y aprueba el pago.</p>}
            </div>
          )}

          {method === 'ach' && (
            <div className="gw-fields">
              <CopyRow label="Banco" value="Banco General" />
              <CopyRow label="Tipo de cuenta" value="Cuenta Corriente" />
              <CopyRow label="Número de cuenta" value="03-01-00-000000-0" />
              <CopyRow label="Beneficiario" value="Reventa Segura, S.A." />
              <CopyRow label="Referencia" value={shortRef} />
            </div>
          )}
        </div>

        <button type="button" className="gw-pay" onClick={() => run('paid', 800)} disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="gw-spinner" aria-hidden="true" />
              Verificando transacción con el banco...
            </>
          ) : method === 'card' ? (
            `${PAY_LABEL.card} ${totalLabel}`
          ) : (
            PAY_LABEL[method]
          )}
        </button>

        <div className="gw-sandbox">
          <p className="gw-sandbox-title">Controles de simulación (Sandbox)</p>
          <div className="gw-sandbox-actions">
            <button type="button" className="gw-sim ok" onClick={() => run('paid', 0)} disabled={busy}>Simular aprobación</button>
            <button type="button" className="gw-sim bad" onClick={() => run('failed', 0)} disabled={busy}>Simular rechazo bancario</button>
          </div>
        </div>
      </section>
    </div>
  );
}
