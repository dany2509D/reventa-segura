'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';

function remaining(deadlineIso: string): number {
  return Math.max(0, Math.floor((new Date(deadlineIso).getTime() - Date.now()) / 1000));
}

export default function ProofForm({ orderId, deadlineIso, inReview }: { orderId: string; deadlineIso: string; inReview: boolean }) {
  const [left, setLeft] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLeft(remaining(deadlineIso));
    const t = setInterval(() => setLeft(remaining(deadlineIso)), 1000);
    return () => clearInterval(t);
  }, [deadlineIso]);

  const expired = left !== null && left <= 0;
  const mm = left === null ? '--' : String(Math.floor(left / 60)).padStart(2, '0');
  const ss = left === null ? '--' : String(left % 60).padStart(2, '0');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || expired) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      // PDFs go as-is; images are shrunk client-side first.
      fd.set('proof', file.type === 'application/pdf' ? file : await prepareImage(file));
      if (reference.trim()) fd.set('reference', reference.trim());
      const r = await postMultipart(`/api/orders/${orderId}/proof`, fd);
      if (r.ok) {
        window.location.assign('/mis-ordenes');
        return;
      }
      setError(errorText(r));
    } catch {
      setError('No pudimos preparar el archivo. Prueba con otra captura.');
    }
    setBusy(false);
  }

  if (expired) {
    return (
      <p role="alert" className="error">
        El plazo terminó y la reserva se libera. <a href="/eventos">Volver a los eventos</a>
      </p>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="notice warning" role="timer" aria-live="off">
        Te quedan <strong className="mono">{mm}:{ss}</strong> para pagar y subir el comprobante.
      </p>
      <label>
        Captura o PDF del comprobante
        <input aria-invalid={false} type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        {file ? <span className="file-picked">{file.name}</span> : null}
      </label>
      <label>
        Número de confirmación (opcional)
        <input aria-invalid={false} type="text" maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !file}>
        {busy ? 'Enviando…' : inReview ? 'Reemplazar comprobante' : 'Enviar comprobante'}
      </button>
    </form>
  );
}
