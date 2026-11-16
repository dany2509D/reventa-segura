'use client';

import { useState, type FormEvent } from 'react';
import { errorText, postJson } from '@/lib/client/http';
import { fetchTestLoginCode } from '@/lib/client/test-login-code';

// Login-code test mode only (no SMS provider yet): the server reveals the code to show here.
export function TestCodeNotice({ code, onUse }: { code: string; onUse: () => void }) {
  return (
    <>
      <p className="notice warning" role="status">
        Modo de prueba: tu código es <strong>{code}</strong>
      </p>
      <button className="btn secondary" type="button" onClick={onUse}>
        Usar este código
      </button>
    </>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTestCode(null);
    const r = await postJson('/api/auth/request', { phone });
    setBusy(false);
    if (r.ok) {
      setStep('code');
      setTestCode(await fetchTestLoginCode(phone)); // null (404) unless test mode is on
    } else if (r.status === 429) setError('Pediste muchos códigos. Espera un rato e inténtalo de nuevo.');
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
      {testCode ? <TestCodeNotice code={testCode} onUse={() => setCode(testCode)} /> : null}
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
      <button className="btn" type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
      <button className="btn secondary" type="button" onClick={() => { setStep('phone'); setCode(''); setTestCode(null); setError(null); }}>
        Cambiar número
      </button>
    </form>
  );
}
