// Loading placeholders for the data-dependent parts of the home page.

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
    <div className="hero-metrics" aria-hidden="true">
      <span className="skeleton sk-line sk-w-stat" />
      <span className="hero-metric-sep" />
      <span className="skeleton sk-line sk-w-stat" />
    </div>
  );
}

export function SectionsSkeleton() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Cargando eventos…
      </p>
      <section className="section feature-section container" aria-hidden="true">
        <div className="section-head--compact">
          <span className="skeleton sk-line sk-w-desc" />
        </div>
        <div className="feature-grid feature-grid--3">
          <div className="feature-card is-skeleton skeleton" />
          <div className="feature-card is-skeleton skeleton" />
          <div className="feature-card is-skeleton skeleton" />
        </div>
      </section>
      <section className="section portals-section container" aria-hidden="true">
        <div className="portals-grid">
          <div className="feature-card is-skeleton skeleton" />
          <div className="feature-card is-skeleton skeleton" />
          <div className="feature-card is-skeleton skeleton" />
        </div>
      </section>
    </>
  );
}
