'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postMultipart } from '@/lib/client/http';
import { prepareImage } from '@/lib/client/image';
import '../_pages/consent.css';

export default function IdentityForm() {
  const [doc, setDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  // Explicit authorization to process identity data (the server requires it too).
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!doc || !selfie || !consent) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('consent', 'yes');
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
        <input aria-invalid={false} type="file" accept="image/*,application/pdf" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} required />
        <span className="hint">Foto clara del documento, con todos los datos visibles.</span>
        {doc ? <span className="file-picked">{doc.name}</span> : null}
      </label>
      <label>
        Selfie
        <input aria-invalid={false} type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} required />
        <span className="hint">Una foto de tu cara. La comparamos con el documento.</span>
        {selfie ? <span className="file-picked">{selfie.name}</span> : null}
      </label>
      <p className="muted">Guardamos tus documentos de forma privada y solo el equipo de verificación los ve.</p>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          Autorizo que Reventa Segura trate mi documento de identidad y mi selfie para verificar quién soy, como explica la{' '}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">
            Política de privacidad
          </a>
          .
        </span>
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="cta-row">
        <a className="btn text" href="/">Cancelar</a>
        <button className="btn" type="submit" disabled={busy || !doc || !selfie || !consent}>
          {busy ? 'Enviando…' : 'Enviar para verificación'}
        </button>
      </div>
    </form>
  );
}
