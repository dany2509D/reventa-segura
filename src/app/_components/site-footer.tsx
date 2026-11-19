import { shellUser } from './current-user';
import { Brand } from './icons';
import { TestModeNotice } from './test-mode';

/**
 * Footer: brand, the routes that exist, the theme selector and the test-mode marker.
 * Deliberately no terms, privacy or contact links: those pages and channels do not exist yet,
 * and a footer must not point at things that are not there.
 */
export default async function SiteFooter() {
  const user = await shellUser();
  const year = new Date().getFullYear();
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
          </div>
          <nav className="footer-nav" aria-label="Pie de página">
            <div>
              <h2>Explorar</h2>
              <ul>
                <li><a href="/">Inicio</a></li>
                <li><a href="/eventos">Eventos</a></li>
                <li><a href="/como-funciona">Cómo funciona</a></li>
              </ul>
            </div>
            <div>
              <h2>Vender</h2>
              <ul>
                <li><a href="/vender">Vender una entrada</a></li>
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
          </nav>
        </div>
        <div className="footer-bottom">
          <p>Reventa Segura · {year}</p>
          <TestModeNotice />
        </div>
        <div className="footer-wordmark-wrap">
          <p className="footer-wordmark" aria-hidden="true">reventa segura</p>
        </div>
      </div>
    </footer>
  );
}
