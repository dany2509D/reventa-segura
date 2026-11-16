'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';

export default function IdentityForm() {
  const [doc, setDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!doc || !selfie) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('doc', await prepareImage(doc));
      fd.set('selfie', await prepareImage(selfie));
      const r = await postMultipart('/api/identity', fd);
      if (r.ok) {
        window.location.reload();
        return;
      }
      setError(errorText(r));
    } catch {
      setError('No pudimos preparar las imágenes. Prueba con otras fotos.');
    }
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Cédula o pasaporte
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} required />
        <span className="hint">Foto clara del documento, con todos los datos visibles.</span>
      </label>
      <label>
        Selfie
        <input type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} required />
        <span className="hint">Una foto de tu cara. La comparamos con el documento.</span>
      </label>
      <p className="muted">Guardamos tus documentos de forma privada y solo el equipo de verificación los ve.</p>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !doc || !selfie}>
        {busy ? 'Enviando…' : 'Enviar para verificación'}
      </button>
    </form>
  );
}
