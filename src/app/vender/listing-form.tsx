'use client';

import { useRef, useState, type FormEvent } from 'react';
import { usdToCents } from '@/lib/admin/forms';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';
import { formatUsd } from '@/lib/format';
import { computeFees } from '@/lib/pricing/pricing';
import { type PosterImage } from '../_components/event-poster';
import EventPoster from '../_components/event-poster';
import { IconChevronDown } from '../_components/icons';
import SuccessCard from '../_components/success-card';

type EventOption = {
  id: string;
  name: string;
  venue: string;
  dateShort: string;
  faceValueCents: number;
  allowsTransfer: boolean;
  cover: PosterImage;
};

function parseUsdCents(raw: string): number | null {
  try {
    const cents = usdToCents(raw);
    return cents > 0 ? cents : null;
  } catch {
    return null;
  }
}

export default function ListingForm({
  events,
  capBps,
  feeBps,
}: {
  events: EventOption[];
  capBps: number;
  feeBps: number;
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState<'transfer' | 'file'>('transfer');
  const [proof, setProof] = useState<File | null>(null);
  const [ticket, setTicket] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  function priceError(message: string) {
    setError(message);
    priceRef.current?.setAttribute('aria-invalid', 'true');
    priceRef.current?.setAttribute('aria-describedby', 'listing-price-hint listing-error');
    priceRef.current?.focus();
  }

  const event = events.find((e) => e.id === eventId) ?? events[0];
  const maxCents = event ? Math.floor((event.faceValueCents * capBps) / 10000) : 0;
  const transferOk = event?.allowsTransfer ?? false;
  const effectiveMode = mode === 'transfer' && !transferOk ? 'file' : mode;
  const parsedCents = parseUsdCents(price);
  const overCap = parsedCents !== null && parsedCents > maxCents;
  const previewFee = parsedCents ? computeFees(parsedCents, feeBps) : null;
  const feePct = String(feeBps / 100).replace('.', ',');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let askCents: number;
    try {
      askCents = usdToCents(price);
    } catch {
      priceError('Escribe un precio válido, por ejemplo 85.50.');
      return;
    }
    if (askCents > maxCents) {
      priceError(`El precio máximo para este evento es ${formatUsd(maxCents)}.`);
      return;
    }
    if (!proof || (effectiveMode === 'file' && !ticket)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('eventId', eventId);
      fd.set('askCents', String(askCents));
      fd.set('deliveryMode', effectiveMode);
      fd.set('proof', await prepareImage(proof));
      if (effectiveMode === 'file' && ticket) fd.set('file', await prepareImage(ticket));
      const r = await postMultipart('/api/listings', fd);
      if (r.ok) {
        setDone(true);
      } else {
        setError(errorText(r));
      }
    } catch {
      setError('No pudimos preparar las imágenes. Prueba con otras fotos.');
    }
    setBusy(false);
  }

  if (done) {
    return (
      <SuccessCard tone="mint">
        <h3>¡Publicación enviada!</h3>
        <p>La revisamos y, cuando esté verificada, aparecerá en el evento. Puedes seguirla en <a href="/vender/publicaciones">Mis publicaciones</a>.</p>
      </SuccessCard>
    );
  }

  return (
    <div className="flow-layout">
      <aside className="flow-aside" aria-label="Resumen de tu publicación">
        <ol className="flow-steps">
          <li className="flow-step is-done">
            <span className="flow-step-num" aria-hidden="true">01</span>
            <div>
              <strong className="flow-step-title">Identidad verificada</strong>
              <span className="flow-step-desc">Tu perfil ya está habilitado para vender.</span>
            </div>
          </li>
          <li className="flow-step is-active">
            <span className="flow-step-num" aria-hidden="true">02</span>
            <div>
              <strong className="flow-step-title">Precio y respaldo</strong>
              <span className="flow-step-desc">Sube la prueba en tu boletera para verificarla.</span>
            </div>
          </li>
          <li className="flow-step">
            <span className="flow-step-num" aria-hidden="true">03</span>
            <div>
              <strong className="flow-step-title">Cobro protegido</strong>
              <span className="flow-step-desc">Recibes tu dinero 12 h después del evento.</span>
            </div>
          </li>
        </ol>

        {event ? (
          <div className="sell-preview">
            <div className="sell-preview-art">
              <EventPoster seed={event.id} title={event.name} image={event.cover} size="card" sizes="(max-width: 899px) 100vw, 420px" priority />
            </div>
            <div className="sell-preview-body">
              <div>
                <p className="eyebrow">Vista previa · {event.dateShort}</p>
                <h2>{event.name}</h2>
                <p className="muted">{event.venue}</p>
              </div>
              <dl className="facts">
                <div>
                  <dt>Valor nominal</dt>
                  <dd className="money">{formatUsd(event.faceValueCents)}</dd>
                </div>
                <div>
                  <dt>Tope permitido</dt>
                  <dd className="money">{formatUsd(maxCents)}</dd>
                </div>
                <div>
                  <dt>Comisión ({feePct} %)</dt>
                  <dd className="money">{previewFee ? `-${formatUsd(previewFee.feeCents)}` : '—'}</dd>
                </div>
              </dl>
              <div className="sell-net">
                <span className="price-label">Tu cobro neto</span>
                <strong key={previewFee ? previewFee.sellerNetCents : 'none'}>
                  {previewFee ? formatUsd(previewFee.sellerNetCents) : '—'}
                </strong>
              </div>
              {overCap ? (
                <p className="notice warning">El monto supera el máximo permitido ({formatUsd(maxCents)}).</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="flow-card">
        <form className="form" onSubmit={submit}>
          <label>
            Evento
            <span className="select-wrap">
              <select aria-invalid={false} value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <IconChevronDown />
            </span>
          </label>
          <label>
            Tu precio (USD)
            {event ? (
              <span className="hint" id="listing-price-hint">
                Valor original {formatUsd(event.faceValueCents)}. Máximo permitido {formatUsd(maxCents)}.
              </span>
            ) : null}
            <input
              ref={priceRef}
              aria-describedby="listing-price-hint"
              aria-invalid={overCap}
              inputMode="decimal"
              placeholder="85.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <fieldset className="choice-group">
            <legend>¿Cómo entregarás la entrada?</legend>
            <label className="choice">
              <input type="radio" name="deliveryMode" checked={effectiveMode === 'transfer'} disabled={!transferOk} onChange={() => setMode('transfer')} />
              <span>Transferirla en la boletera (recomendado){!transferOk ? ' — no disponible en este evento' : ''}</span>
            </label>
            <label className="choice">
              <input type="radio" name="deliveryMode" checked={effectiveMode === 'file'} onChange={() => setMode('file')} />
              <span>Enviar la entrada como imagen</span>
            </label>
          </fieldset>
          <label>
            Captura de tu cuenta de la boletera
            <input aria-invalid={false} type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0] ?? null)} required />
            <span className="hint">Debe verse la entrada a tu nombre.</span>
            {proof ? <span className="file-picked">{proof.name}</span> : null}
          </label>
          {effectiveMode === 'file' ? (
            <label>
              Imagen de la entrada (con el código QR)
              <input aria-invalid={false} type="file" accept="image/*" onChange={(e) => setTicket(e.target.files?.[0] ?? null)} required />
              {ticket ? <span className="file-picked">{ticket.name}</span> : null}
            </label>
          ) : null}
          <p className="muted">Cobras cuando el comprador entra al evento. Descontamos una comisión del {feePct} %.</p>
          {error ? <p id="listing-error" role="alert" className="error">{error}</p> : null}
          <div className="cta-row">
            <a className="btn text" href="/">Cancelar</a>
            <button className="btn" type="submit" disabled={busy || !proof || !price}>
              {busy ? 'Publicando…' : 'Publicar entrada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
