import { IconArrowRight, IconArrowUpRight, IconEvents, IconOrders, IconSell } from '../_components/icons';
import { eventCountLabel, ticketCountLabel, type HomeData } from './view-model';

/**
 * Compact 3-destination directory on `/` so each part of the marketplace has its own screen,
 * aesthetic and menu destination (`Eventos`, `Mis órdenes`, `Vender`).
 */
export default async function AppPortals({ data }: { data: Promise<HomeData> }) {
  const { totals } = await data;
  return (
    <section className="section portals-section container" aria-labelledby="portales-title">
      <header className="section-head section-head--compact reveal">
        <h2 id="portales-title" className="feature-heading">
          Ir directo a cada sección
        </h2>
        <a className="section-link" href="/como-funciona">
          Cómo funciona
          <IconArrowRight />
        </a>
      </header>

      <div className="portals-grid">
        <a className="portal-card reveal reveal-0" href="/eventos">
          <div>
            <div className="portal-card-top">
              <span className="portal-icon" aria-hidden="true">
                <IconEvents />
              </span>
              <span className="portal-pill">{eventCountLabel(totals.events)}</span>
            </div>
            <h3>Explorar cartelera</h3>
            <p>Filtra conciertos, deportes y teatro por disponibilidad o presupuesto en Panamá.</p>
          </div>
          <div className="portal-foot">
            <span>Abrir eventos</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>

        <a className="portal-card reveal reveal-1" href="/mis-ordenes">
          <div>
            <div className="portal-card-top">
              <span className="portal-icon" aria-hidden="true">
                <IconOrders />
              </span>
              <span className="portal-pill">Solo compras</span>
            </div>
            <h3>Mis órdenes y entradas</h3>
            <p>Sigue el progreso de entrega de tus compras, descarga tus boletos y abre reportes.</p>
          </div>
          <div className="portal-foot">
            <span>Abrir órdenes</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>

        <a className="portal-card is-accent reveal reveal-2" href="/vender" data-track="sell_cta_click" data-track-label="home-portal">
          <div>
            <div className="portal-card-top">
              <span className="portal-icon" aria-hidden="true">
                <IconSell />
              </span>
              <span className="portal-pill">{ticketCountLabel(totals.listings)} ahora</span>
            </div>
            <h3>Vender una entrada</h3>
            <p>Publica con cobro neto en vivo, gestiona tus publicaciones y sigue tus ventas.</p>
          </div>
          <div className="portal-foot">
            <span>Publicar entrada</span>
            <span className="round-arrow" aria-hidden="true">
              <IconArrowUpRight />
            </span>
          </div>
        </a>
      </div>
    </section>
  );
}
