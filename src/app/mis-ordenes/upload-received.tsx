'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';

export default function UploadReceived({ orderId }: { orderId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('screenshot', await prepareImage(file));
      const r = await postMultipart(`/api/orders/${orderId}/received`, fd);
      if (r.ok) {
        window.location.reload();
        return;
      }
      setError(errorText(r));
    } catch {
      setError('No pudimos preparar la imagen. Prueba con otra captura.');
    }
    setBusy(false);
  }

  return (
    <form className="form form-inset" onSubmit={submit}>
      <label>
        Captura de la entrada en tu cuenta de la boletera
        <input aria-invalid={false} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <span className="hint">Debe verse la entrada a tu nombre.</span>
        {file ? <span className="file-picked">{file.name}</span> : null}
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !file}>
        {busy ? 'Enviando…' : 'Ya recibí la entrada'}
      </button>
    </form>
  );
}
