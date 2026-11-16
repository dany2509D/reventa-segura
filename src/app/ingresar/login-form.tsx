'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postJson } from '@/lib/client/http';

export default function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await postJson('/api/auth/request', { phone });
    setBusy(false);
    if (r.ok) setStep('code');
    else if (r.status === 429) setError('Pediste muchos códigos. Espera un rato e inténtalo de nuevo.');
    else if (r.status === 400) setError('Escribe un celular panameño válido, por ejemplo 6123-4567.');
    else setError(errorText(r));
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await postJson('/api/auth/verify', { phone, code });
    if (r.ok) {
      window.location.assign(r.data.mfaRequired ? '/admin/mfa' : next);
      return;
    }
    setBusy(false);
    setError(r.status === 401 ? 'Código incorrecto o vencido.' : errorText(r));
  }

  if (step === 'phone') {
    return (
      <form className="form" onSubmit={sendCode}>
        <label>
          Tu celular
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="6123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <span className="hint">Solo celulares de Panamá.</span>
        </label>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <button className="btn" type="submit" disabled={busy || phone.trim().length < 8}>
          {busy ? 'Enviando…' : 'Enviar código'}
        </button>
      </form>
    );
  }
  return (
    <form className="form" onSubmit={verify}>
      <p>Enviamos un código de 6 dígitos a <strong>{phone}</strong>.</p>
      <label>
        Código
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="cta-row">
        <button className="btn text" type="button" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>
          Cambiar número
        </button>
        <button className="btn" type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
