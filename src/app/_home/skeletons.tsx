// Loading placeholders for the data-dependent parts of the home page. Each one has the same box
// as the content that replaces it (same classes, same heights), so nothing shifts when the
// events arrive. Decorative: hidden from assistive technology, which gets one status message.

export function SearchSkeleton() {
  return (
    <div className="search" aria-hidden="true">
      <div className="search-field is-skeleton">
        <span className="skeleton sk-line sk-w-50" />
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <p className="hero-stats" aria-hidden="true">
      <span className="skeleton sk-line sk-w-stat" />
      <span className="skeleton sk-line sk-w-stat" />
    </p>
  );
}

export function TicketSkeleton() {
  return (
    <div className="hero-ticket ticket is-skeleton" aria-hidden="true">
      <div className="ticket-main">
        <span className="skeleton sk-line sk-w-40" />
        <span className="skeleton sk-title sk-w-80" />
        <span className="skeleton sk-line sk-w-60" />
        <span className="skeleton sk-line sk-w-50" />
      </div>
      <div className="ticket-stub hero-ticket-stub">
        <span className="skeleton sk-title sk-w-40" />
        <span className="skeleton sk-round" />
      </div>
    </div>
  );
}

export function SectionsSkeleton() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Cargando eventos…
      </p>
      <section className="section container" aria-hidden="true">
        <div className="section-head">
          <span className="skeleton sk-line sk-w-eyebrow" />
          <span className="skeleton sk-heading" />
          <span className="skeleton sk-line sk-w-desc" />
        </div>
        <div className="feature-grid feature-grid--2">
          <div className="feature-card is-lead is-skeleton skeleton" />
          <div className="feature-card is-skeleton skeleton" />
        </div>
      </section>
      <section className="section container" aria-hidden="true">
        <div className="section-head">
          <span className="skeleton sk-line sk-w-eyebrow" />
          <span className="skeleton sk-heading" />
        </div>
        <div className="agenda">
          <div className="agenda-row is-skeleton"><span className="skeleton sk-row" /></div>
          <div className="agenda-row is-skeleton"><span className="skeleton sk-row" /></div>
          <div className="agenda-row is-skeleton"><span className="skeleton sk-row" /></div>
        </div>
      </section>
    </>
  );
}
