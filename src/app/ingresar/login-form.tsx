'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { errorText, postJson } from '@/lib/client/http';
import { FAKE_SMS, confirmPhoneOtp, sendPhoneOtp } from '@/lib/firebase/phone-auth';
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

const RECAPTCHA_ID = 'recaptcha-container';

// "6123-4567", "+507 6123 4567" or "50761234567" -> "+50761234567"; null when not a Panama mobile.
function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('507') ? digits.slice(3) : digits;
  return /^6\d{7}$/.test(local) ? `+507${local}` : null;
}

function firebaseErrorText(err: unknown): string {
  const c = (err as { code?: string })?.code ?? '';
  if (c.includes('too-many-requests')) return 'Demasiados intentos. Espera un rato e inténtalo de nuevo.';
  if (c.includes('invalid-phone-number')) return 'Escribe un celular panameño válido, por ejemplo 6123-4567.';
  if (c.includes('invalid-verification-code') || c.includes('code-expired')) return 'Código incorrecto o vencido.';
  return 'No pudimos completar la verificación. Inténtalo de nuevo.';
}

export default function LoginForm({ next }: { next: string }) {
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendFirebaseCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const e164 = toE164(phone);
    if (!e164) {
      setBusy(false);
      setError('Escribe un celular panameño válido, por ejemplo 6123-4567.');
      return;
    }
    try {
      confirmation.current = await sendPhoneOtp(e164, RECAPTCHA_ID);
      setStep('code');
    } catch (err) {
      setError(firebaseErrorText(err));
    }
    setBusy(false);
  }

  async function verifyFirebaseCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let idToken: string;
    try {
      idToken = await confirmPhoneOtp(confirmation.current, code);
    } catch (err) {
      setBusy(false);
      setError(firebaseErrorText(err));
      return;
    }
    const r = await postJson('/api/auth/verify', { idToken });
    if (r.ok) {
      window.location.assign(r.data.mfaRequired ? '/admin/mfa' : next);
      return;
    }
    setBusy(false);
    setError(r.status === 401 ? 'Código incorrecto o vencido.' : errorText(r));
  }

  async function sendCode(e: FormEvent) {
    if (!FAKE_SMS) return sendFirebaseCode(e);
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
    if (!FAKE_SMS) return verifyFirebaseCode(e);
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

  const phoneForm = (
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

  const codeForm = (
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
      <div className="cta-row">
        <button className="btn text" type="button" onClick={() => { setStep('phone'); setCode(''); setTestCode(null); setError(null); }}>
          Cambiar número
        </button>
        <button className="btn" type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* Invisible reCAPTCHA mount point; stays mounted across both steps. */}
      <div id={RECAPTCHA_ID} />
      {step === 'phone' ? phoneForm : codeForm}
    </>
  );
}
