import type { ReactNode } from 'react';
import { businessInfo, mailtoHref, SITE_NAME, socialLinks, telHref, type SocialLink } from '@/lib/site/site-config';
import CookiePreferencesButton from './cookie-preferences-button';
import { shellUser } from './current-user';
import { Brand } from './icons';
import { TestModeNotice } from './test-mode';
import './site-footer.css';

// Simple one-colour glyphs, decorative: the link's accessible name is the network's name.
const SOCIAL_GLYPHS: Record<SocialLink['name'], ReactNode> = {
  Instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.3 6.7v.01" />
    </>
  ),
  Facebook: <path d="M14.5 3.5h-2A3.5 3.5 0 0 0 9 7v2.5H6.5V13H9v7.5h3.5V13H15l.5-3.5h-3V7.3c0-.5.3-.8.8-.8h1.2z" />,
  X: <path d="M5 4.5l14 15M19 4.5l-14 15" />,
  TikTok: <path d="M14 3.5v10.7a3.6 3.6 0 1 1-3.6-3.6M14 3.5c.3 2.5 1.9 4.1 4.6 4.3" />,
};

/**
 * Footer: brand, the routes that exist, the legal pages, the real contact channels and the
 * test-mode marker. Contact channels, social accounts and business data appear only when the
 * owner has configured them (see src/lib/site/site-config.ts): the footer never points at
 * something that is not there.
 */
export default async function SiteFooter() {
  const user = await shellUser();
  const year = new Date().getFullYear();
  const { legalName, ruc, address, email, phone } = businessInfo();
  const social = socialLinks();
  return (
    <footer className="site-footer on-scrim">
      <div className="site-footer-inner container">
        <div className="footer-top">
          <div className="footer-brand">
            <a className="brand" href="/" aria-label="Reventa Segura: inicio">
              <Brand />
            </a>
            <p className="footer-statement">
              Reventa de entradas entre personas en Panamá. El pago se retiene y llega al vendedor después del evento.
            </p>
            {email || phone ? (
              <ul className="footer-contact" aria-label="Contacto">
                {email ? (
                  <li>
                    <a href={mailtoHref(email)} data-track="generate_lead" data-track-label="email">
                      {email}
                    </a>
                  </li>
                ) : null}
                {phone ? (
                  <li>
                    <a href={telHref(phone)} data-track="generate_lead" data-track-label="telefono">
                      {phone}
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {social.length ? (
              <ul className="footer-social" aria-label="Redes sociales">
                {social.map((s) => (
                  <li key={s.name}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer me" aria-label={`${s.name} (se abre en una pestaña nueva)`}>
                      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        {SOCIAL_GLYPHS[s.name]}
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <nav className="footer-nav" aria-label="Pie de página">
            <div>
              <h2>Explorar</h2>
              <ul>
                <li><a href="/">Inicio</a></li>
                <li><a href="/eventos">Eventos</a></li>
                <li><a href="/como-funciona">Cómo funciona</a></li>
                <li><a href="/#preguntas">Preguntas frecuentes</a></li>
              </ul>
            </div>
            <div>
              <h2>Vender</h2>
              <ul>
                <li><a href="/vender" data-track="sell_cta_click" data-track-label="footer">Vender una entrada</a></li>
                <li><a href="/vender/publicaciones">Mis publicaciones</a></li>
                <li><a href="/vender/ventas">Mis ventas</a></li>
              </ul>
            </div>
            <div>
              <h2>Tu cuenta</h2>
              <ul>
                <li><a href="/mis-ordenes">Mis órdenes</a></li>
                {!user ? <li><a href="/ingresar">Ingresar</a></li> : null}
              </ul>
            </div>
            <div>
              <h2>Legal</h2>
              <ul>
                <li><a href="/terminos">Términos y aviso legal</a></li>
                <li><a href="/privacidad">Política de privacidad</a></li>
                <li><a href="/cookies">Política de cookies</a></li>
                <li><a href="/reembolsos">Reembolsos y garantías</a></li>
                <li><CookiePreferencesButton>Preferencias de cookies</CookiePreferencesButton></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="footer-bottom">
          <p className="footer-business">
            © {year} {legalName ?? SITE_NAME}
            {ruc ? ` · RUC ${ruc}` : ''}
            {address ? ` · ${address}` : ''}
          </p>
          <TestModeNotice />
        </div>
        <div className="footer-wordmark-wrap">
          <p className="footer-wordmark" aria-hidden="true">reventa segura</p>
        </div>
      </div>
    </footer>
  );
}
