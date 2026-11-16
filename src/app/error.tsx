'use client';

// Error state for any page under the root layout (for example, the events query failing).
// The header, footer and tab bar stay in place; this replaces only the page content.
// Nothing about the error is shown to the visitor: details stay in the server logs.
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page state-page">
      <p className="state-code">Error</p>
      <h1>No pudimos cargar esta página.</h1>
      <p className="lead">Puede ser un problema momentáneo. Inténtalo de nuevo; si sigue fallando, vuelve en unos minutos.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => reset()}>
          Reintentar
        </button>
        <a className="btn secondary" href="/">
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
