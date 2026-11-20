'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { OPEN_PREFERENCES_EVENT, readConsent, writeConsent, type ConsentState } from '@/lib/consent/consent';
import './cookie-consent.css';

/**
 * Cookie notice. Until the visitor chooses, a compact banner sits at the bottom (above the tab bar
 * on phones). It never blocks the page and does not take focus. "Configurar" (and the footer link
 * "Preferencias de cookies", any time later) opens a modal dialog with the categories.
 *
 * Necessary storage (login session, theme, this choice) needs no consent. Analytics is off until
 * "Aceptar" and is only offered when a measurement id is configured (`analyticsAvailable`); when it
 * is not, the banner is informational. Accept and Reject look the same on purpose.
 */
export default function CookieConsent({ analyticsAvailable }: { analyticsAvailable: boolean }) {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setAnalytics(stored?.analytics ?? false);
    setReady(true);
    const reopen = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setAnalytics(readConsent()?.analytics ?? false);
      setOpen(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, reopen);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, ready]);

  function save(value: boolean) {
    setConsent(writeConsent(value));
    setAnalytics(value);
    setOpen(false);
  }

  function openFromBanner(button: HTMLElement) {
    returnFocus.current = button;
    setOpen(true);
  }

  if (!ready) return null;

  return (
    <>
      {consent === null && !open ? (
        <section className="cookie-banner" role="region" aria-labelledby={titleId} aria-describedby={descId}>
          <h2 id={titleId} className="cookie-title">
            Tu privacidad
          </h2>
          <p id={descId} className="cookie-text">
            {analyticsAvailable
              ? 'Usamos almacenamiento necesario para que el sitio funcione (tu sesión y el tema). Con tu permiso también usamos analítica para medir las visitas y mejorar el sitio. Puedes cambiarlo cuando quieras.'
              : 'Este sitio usa solo almacenamiento necesario para funcionar (tu sesión y el tema). No usamos cookies de analítica ni de publicidad.'}{' '}
            <a href="/cookies">Política de cookies</a>
          </p>
          <div className="cookie-actions">
            {analyticsAvailable ? (
              <>
                <button type="button" className="btn sm" onClick={() => save(true)}>
                  Aceptar todas
                </button>
                <button type="button" className="btn sm" onClick={() => save(false)}>
                  Rechazar no esenciales
                </button>
                <button type="button" className="btn sm outline" onClick={(e) => openFromBanner(e.currentTarget)}>
                  Configurar
                </button>
              </>
            ) : (
              <button type="button" className="btn sm" onClick={() => save(false)}>
                Entendido
              </button>
            )}
          </div>
        </section>
      ) : null}

      <dialog
        ref={dialogRef}
        className="cookie-dialog"
        aria-labelledby={`${titleId}-dialog`}
        onClose={() => {
          setOpen(false);
          returnFocus.current?.focus();
        }}
      >
        <form
          method="dialog"
          className="cookie-dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            save(analyticsAvailable && analytics);
          }}
        >
          <h2 id={`${titleId}-dialog`} className="cookie-title">
            Preferencias de cookies
          </h2>
          <p className="cookie-text">Elige qué almacenamiento podemos usar. Tu elección se guarda en este navegador y puedes cambiarla desde el pie de página.</p>

          <div className="cookie-row">
            <input id={`${titleId}-nec`} type="checkbox" checked disabled />
            <label htmlFor={`${titleId}-nec`}>
              <strong>Necesarias</strong>
              <span>Mantienen tu sesión iniciada, protegen el ingreso y recuerdan el tema y esta elección. Siempre activas.</span>
            </label>
          </div>
          <div className="cookie-row">
            <input
              id={`${titleId}-ana`}
              type="checkbox"
              checked={analyticsAvailable && analytics}
              disabled={!analyticsAvailable}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
            <label htmlFor={`${titleId}-ana`}>
              <strong>Analítica</strong>
              <span>
                {analyticsAvailable
                  ? 'Nos dicen cuántas personas visitan el sitio y qué páginas usan, sin publicidad. Solo se activan si las aceptas.'
                  : 'No usamos analítica en este momento.'}
              </span>
            </label>
          </div>

          <div className="cookie-actions">
            <button type="submit" className="btn sm">
              Guardar mi elección
            </button>
            <button type="button" className="btn sm outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
          <p className="cookie-text">
            Más detalle en la <a href="/cookies">Política de cookies</a>.
          </p>
        </form>
      </dialog>
    </>
  );
}
