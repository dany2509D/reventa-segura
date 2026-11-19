import { IconArrowUpRight } from './_components/icons';

export const metadata = { title: 'Página no encontrada' };

// 404 for unknown addresses and for events, listings or orders that do not exist (or are not yours).
export default function NotFound() {
  return (
    <main className="page wide state-page">
      <div className="notfound-head">
        <p className="state-code">
          <span className="dot" aria-hidden="true" />
          Error 404
        </p>
        <div>
          <h1>
            <span className="notfound-muted">Lo sentimos</span>
            Esta página no existe.
          </h1>
          <p className="lead">Puede que el evento ya haya pasado, que la entrada se haya vendido o que la dirección esté mal escrita.</p>
          <div className="actions">
            <a className="btn" href="/">
              Volver al inicio
            </a>
          </div>
        </div>
      </div>

      <div className="notfound-cards">
        <a className="notfound-card reveal reveal-0" href="/eventos" data-card="">
          <div className="notfound-art">
            <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle className="nf-ring" cx="60" cy="60" r="46" />
              <circle className="nf-ring" cx="60" cy="60" r="30" />
              <circle className="nf-dot" cx="60" cy="60" r="7" />
            </svg>
          </div>
          <div className="notfound-foot">
            <span className="notfound-title">Explorar eventos</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>

        <a className="notfound-card reveal reveal-1" href="/vender" data-card="">
          <div className="notfound-art">
            <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle className="nf-ring" cx="60" cy="60" r="46" />
              <circle className="nf-blue" cx="60" cy="60" r="24" />
              <path className="nf-ink-stroke" d="M60 44v32M44 60h32" />
            </svg>
          </div>
          <div className="notfound-foot">
            <span className="notfound-title">Vender una entrada</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>

        <a className="notfound-card reveal reveal-2" href="/como-funciona">
          <div className="notfound-art">
            <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <path className="nf-line" d="M16 24h18M16 36h18M16 48h18M16 72h18M16 84h18M16 96h18" />
              <path className="nf-blue-stroke" d="M16 60h80" />
              <circle className="nf-dot" cx="102" cy="60" r="5" />
            </svg>
          </div>
          <div className="notfound-foot">
            <span className="notfound-title">Cómo funciona el escrow</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>
      </div>
    </main>
  );
}
