// Shown while any page under the root layout waits for its data (events, orders, admin...).
// The header, footer and tab bar stay in place. Same box model as .state-page so nothing jumps.
// Decorative blocks are hidden from assistive technology, which gets one status message.
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <p className="visually-hidden" role="status">
        Cargando…
      </p>
      <div className="loading-page container" aria-hidden="true">
        <span className="skeleton loading-title" />
        <span className="skeleton loading-line" />
        <span className="skeleton loading-line loading-line--short" />
        <span className="skeleton loading-block" />
      </div>
    </main>
  );
}
