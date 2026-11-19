'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';
import SuccessCard from '../../_components/success-card';

export default function DisputeForm({ orderId }: { orderId: string }) {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('reason', reason.trim());
      for (const f of files.slice(0, 5)) fd.append('evidence', await prepareImage(f));
      const r = await postMultipart(`/api/orders/${orderId}/dispute`, fd);
      if (r.ok) setDone(true);
      else setError(errorText(r));
    } catch {
      setError('No pudimos preparar las imágenes. Prueba con otras.');
    }
    setBusy(false);
  }

  if (done) {
    return (
      <SuccessCard tone="sky">
        <h3>Recibimos tu reporte</h3>
        <p>Lo revisaremos y te avisaremos en Mis órdenes. Tu dinero está retenido mientras tanto.</p>
        <a className="btn" href="/mis-ordenes">Ir a mis órdenes</a>
      </SuccessCard>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        ¿Qué pasó?
        <textarea aria-invalid={false} rows={5} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      <label>
        Fotos o capturas (opcional, hasta 5)
        <input aria-invalid={false} type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
        {files.length > 0 ? <span className="file-picked">{files.map((f) => f.name).join(' · ')}</span> : null}
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="cta-row">
        <a className="btn text" href="/mis-ordenes">Cancelar</a>
        <button className="btn" type="submit" disabled={busy || reason.trim().length < 5}>
          {busy ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </div>
    </form>
  );
}
