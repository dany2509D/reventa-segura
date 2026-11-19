'use client';

import './globals.css';

/**
 * Last-resort error screen: it replaces the WHOLE page, root layout included, when the layout
 * itself fails (error.tsx covers every other case and keeps the header and footer). It therefore
 * renders its own <html> and <body>, uses only plain markup and the global stylesheet, and shows
 * nothing about the error: details stay in the server logs.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es" data-theme="light">
      <head>
        <title>Algo salió mal · Reventa Segura</title>
        <meta name="robots" content="noindex" />
      </head>
      <body>
        <main className="page narrow state-page">
          <div className="state-copy">
            <p className="state-code">Error</p>
            <h1>Algo salió mal.</h1>
            <p className="lead">No pudimos cargar el sitio. Puede ser un problema momentáneo: inténtalo de nuevo o vuelve en unos minutos.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => reset()}>
                Reintentar
              </button>
              <a className="btn secondary" href="/">
                Ir al inicio
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
