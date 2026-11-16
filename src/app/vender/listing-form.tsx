'use client';

import { useState, type FormEvent } from 'react';
import { usdToCents } from '@/lib/admin/forms';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';
import { formatUsd } from '@/lib/format';
import { IconChevronDown } from '../_components/icons';

type EventOption = { id: string; name: string; faceValueCents: number; allowsTransfer: boolean };

export default function ListingForm({ events, capBps }: { events: EventOption[]; capBps: number }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState<'transfer' | 'file'>('transfer');
  const [proof, setProof] = useState<File | null>(null);
  const [ticket, setTicket] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const event = events.find((e) => e.id === eventId);
  const maxCents = event ? Math.floor((event.faceValueCents * capBps) / 10000) : 0;
  const transferOk = event?.allowsTransfer ?? false;
  const effectiveMode = mode === 'transfer' && !transferOk ? 'file' : mode;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let askCents: number;
    try {
      askCents = usdToCents(price);
    } catch {
      setError('Escribe un precio válido, por ejemplo 85.50.');
      return;
    }
    if (askCents > maxCents) {
      setError(`El precio máximo para este evento es ${formatUsd(maxCents)}.`);
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
      <div className="card pastel tone-mint">
        <h3>¡Publicación enviada!</h3>
        <p>La revisamos y, cuando esté verificada, aparecerá en el evento. Puedes seguirla en <a href="/mis-ordenes">Mis órdenes</a>.</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Evento
        <span className="select-wrap">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <IconChevronDown />
        </span>
      </label>
      <label>
        Tu precio (USD)
        <input inputMode="decimal" placeholder="85.00" value={price} onChange={(e) => setPrice(e.target.value)} required />
        {event ? <span className="hint">Valor original {formatUsd(event.faceValueCents)}. Máximo permitido {formatUsd(maxCents)}.</span> : null}
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
        <input type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0] ?? null)} required />
        <span className="hint">Debe verse la entrada a tu nombre.</span>
      </label>
      {effectiveMode === 'file' ? (
        <label>
          Imagen de la entrada (con el código QR)
          <input type="file" accept="image/*" onChange={(e) => setTicket(e.target.files?.[0] ?? null)} required />
        </label>
      ) : null}
      <p className="muted">Cobras cuando el comprador entra al evento. Descontamos una comisión del 10 %.</p>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="cta-row">
        <a className="btn text" href="/">Cancelar</a>
        <button className="btn" type="submit" disabled={busy || !proof || !price}>
          {busy ? 'Publicando…' : 'Publicar entrada'}
        </button>
      </div>
    </form>
  );
}
