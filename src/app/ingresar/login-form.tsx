'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { errorText, postJson } from '@/lib/client/http';
import { FAKE_SMS, confirmPhoneOtp, sendPhoneOtp } from '@/lib/firebase/phone-auth';
import { fetchTestLoginCode } from '@/lib/client/test-login-code';
import '../_pages/consent.css';

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
  const { code: c = '', message = '' } = (err ?? {}) as { code?: string; message?: string };
  let text = 'No pudimos completar la verificación. Inténtalo de nuevo.';
  if (c.includes('too-many-requests')) text = 'Demasiados intentos. Espera un rato e inténtalo de nuevo.';
  else if (c.includes('invalid-phone-number')) text = 'Escribe un celular panameño válido, por ejemplo 6123-4567.';
  else if (c.includes('invalid-verification-code') || c.includes('code-expired')) text = 'Código incorrecto o vencido.';
  // Diagnostics only outside production.
  return process.env.NODE_ENV !== 'production' ? `${text} [${c || 'sin-código'}] ${message}` : text;
}

export default function LoginForm({ next }: { next: string }) {
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Explicit acceptance of the terms and the privacy policy before a code is requested.
  const [accepted, setAccepted] = useState(false);
  // Honeypot: hidden from people; a bot that fills every input fills this one too.
  const [trap, setTrap] = useState('');

  // Web OTP: on phones that support it (Chrome on Android), the SMS code is offered to the page
  // automatically; the person still presses "Entrar". The request is cancelled when the step changes.
  useEffect(() => {
    if (step !== 'code' || !('OTPCredential' in window)) return;
    const abort = new AbortController();
    const request = { otp: { transport: ['sms'] }, signal: abort.signal } as CredentialRequestOptions;
    navigator.credentials
      .get(request)
      .then((credential) => {
        const otp = (credential as (Credential & { code?: string }) | null)?.code;
        if (otp) setCode(otp.replace(/\D/g, '').slice(0, 6));
      })
      .catch(() => {
        /* dismissed or unsupported: the person types the code */
      });
    return () => abort.abort();
  }, [step]);

  async function sendFirebaseCode(e: FormEvent) {
    e.preventDefault();
    if (trap) {
      // A bot: look like success, send nothing.
      setStep('code');
      return;
    }
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
    const r = await postJson('/api/auth/request', { phone, website: trap });
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
        <span className="hint" id="login-phone-hint">Paso 1 de 2 · Solo números móviles de Panamá.</span>
        <div className="phone-field">
          <span className="phone-prefix" aria-hidden="true">+507</span>
          <input
            aria-describedby="login-phone-hint"
            aria-invalid={false}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="6123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
      </label>
      <div className="hp-field" aria-hidden="true">
        <label>
          Sitio web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>
      <label className="consent">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
        <span>
          Acepto los{' '}
          <a href="/terminos" target="_blank" rel="noopener noreferrer">
            Términos y condiciones
          </a>{' '}
          y la{' '}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">
            Política de privacidad
          </a>
          .
        </span>
      </label>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || phone.trim().length < 8 || !accepted} data-track="login_start">
        {busy ? 'Enviando…' : 'Enviar código'}
      </button>
    </form>
  );

  const codeForm = (
    <form className="form" onSubmit={verify}>
      <p>Paso 2 de 2 · Enviamos un código de 6 dígitos a <strong className="mono">{phone}</strong>.</p>
      {testCode ? <TestCodeNotice code={testCode} onUse={() => setCode(testCode)} /> : null}
      <label>
        Código de verificación
        <input
          aria-invalid={false}
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          enterKeyHint="done"
          autoComplete="one-time-code"
          placeholder="000000"
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
      <div key={step} className="login-step">
        {step === 'phone' ? phoneForm : codeForm}
      </div>
    </>
  );
}
