import type { ReactNode } from 'react';
import { businessInfo, orTodo, SITE_NAME } from '@/lib/site/site-config';
import './legal.css';

/** Date of the current wording of the legal texts. Change it whenever a text below changes. */
export const LEGAL_UPDATED = '19 de noviembre de 2026';

/**
 * The legal texts are a base draft written from what the platform does. Set this to `true` only
 * after a lawyer has approved all four pages and every `[COMPLETAR_…]` marker is gone: until then
 * each page says so at the top.
 */
export const LEGAL_REVIEWED = false;

/** The business facts the legal pages print, each one or its explicit `[COMPLETAR_…]` marker. */
export function legalFacts() {
  const b = businessInfo();
  return {
    name: orTodo(b.legalName, 'RAZON_SOCIAL'),
    ruc: orTodo(b.ruc, 'RUC'),
    address: orTodo(b.address, 'DIRECCION_DEL_NEGOCIO'),
    email: b.email,
    emailText: orTodo(b.email, 'CORREO_DE_CONTACTO'),
    /** Names of the facts still missing, for the draft notice. */
    missing: [
      b.legalName ? null : 'razón social',
      b.ruc ? null : 'RUC',
      b.address ? null : 'dirección',
      b.email ? null : 'correo de contacto',
    ].filter((x): x is string => x !== null),
  };
}

export interface LegalSectionDef {
  id: string;
  title: string;
}

/**
 * Shared frame of the legal pages: one H1, a short table of contents, readable line length, and a
 * notice (shown only while business data is missing) that explains the [COMPLETAR_…] markers.
 */
export function LegalPage({
  eyebrow = 'Legal',
  title,
  intro,
  sections,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro: string;
  sections: LegalSectionDef[];
  children: ReactNode;
}) {
  const { missing } = legalFacts();
  return (
    <main className="page legal">
      <header className="page-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead">{intro}</p>
        <p className="legal-meta">
          {SITE_NAME} · Última actualización: <time dateTime="2026-11-19">{LEGAL_UPDATED}</time>
        </p>
      </header>

      {!LEGAL_REVIEWED || missing.length ? (
        <p className="notice warning" role="note">
          <strong>Texto base en revisión legal.</strong>{' '}
          {missing.length
            ? `Faltan datos del negocio por completar (${missing.join(', ')}). `
            : ''}
          Lo que aparece entre corchetes como [COMPLETAR_…] lo define el negocio o su abogado antes del lanzamiento y desaparecerá al hacerlo.
        </p>
      ) : null}

      <nav className="legal-toc" aria-label="En esta página">
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="legal-body">{children}</div>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="legal-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

/** A business fact inline: the value, or its marker highlighted so an unfilled one cannot be missed. */
export function Fact({ children }: { children: string }) {
  return children.startsWith('[COMPLETAR_') ? <mark>{children}</mark> : <>{children}</>;
}

/** An explicit `[COMPLETAR_NOMBRE]` marker for something the business or its lawyer has to decide. */
export function Todo({ name }: { name: string }) {
  return <mark>{`[COMPLETAR_${name}]`}</mark>;
}
