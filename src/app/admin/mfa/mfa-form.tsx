'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function MfaForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }
      if (res.status === 429) setError('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
      else if (res.status === 400) setError('El código debe tener 6 dígitos.');
      else setError('Código incorrecto.');
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <label htmlFor="code">Código</label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        required
      />
      {error ? <p role="alert" className="admin-error">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Verificando…' : 'Verificar'}
      </button>
    </form>
  );
}
