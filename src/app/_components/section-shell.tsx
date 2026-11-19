import type { ReactNode } from 'react';
import './section-shell.css';

export type SectionTone = 'eventos' | 'ordenes' | 'vender';

type Props = {
  tone: SectionTone;
  eyebrow: string;
  title: string;
  /** id for the h1 when something focuses it (e.g. the catalogue search moves focus to it). */
  titleId?: string;
  lead?: string;
  /** Right-hand side of the header: figures or a search box for this section. */
  aside?: ReactNode;
  /** Section tabs, under the header. */
  nav?: ReactNode;
  children: ReactNode;
};

/**
 * The page frame of an app section. Each section has its own accent (data-section → --section*),
 * so Eventos, Órdenes and Vender read as different places while sharing one layout.
 */
export default function SectionShell({ tone, eyebrow, title, titleId, lead, aside, nav, children }: Props) {
  return (
    <main className="page wide section-page" data-section={tone}>
      <header className="section-hero">
        <div className="section-hero-copy">
          <p className="eyebrow">
            <span className="dot" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 id={titleId} tabIndex={titleId ? -1 : undefined}>
            {title}
          </h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {aside ? <div className="section-hero-aside">{aside}</div> : null}
      </header>
      {nav}
      {children}
    </main>
  );
}
