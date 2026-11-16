import { shellUser } from './current-user';
import HeaderScroll from './header-scroll';
import { Brand, IconAdmin, IconEvents, IconOrders, IconSell, IconUser } from './icons';
import LogoutButton from './logout-button';
import NavLink from './nav-link';
import ThemeSwitch from './theme-switch';

/**
 * Top bar: wordmark, section links, theme selector and the account action. Sticky; once the page
 * scrolls it gains a translucent plate and (from tablet up) a compact height, by transform only.
 * On phones the section links live in the bottom tab bar instead (<TabBar />, same destinations).
 */
export default async function SiteHeader() {
  const user = await shellUser();
  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="site-header" id="site-header">
        {/* The translucent plate is its own element (see globals.css: a blurred backdrop cannot
            live inside an element that carries a view-transition-name). */}
        <div className="header-plate" aria-hidden="true" />
        <div className="site-header-inner container">
          <a className="brand" href="/" aria-label="Reventa Segura: inicio">
            <Brand />
          </a>
          <nav className="site-nav" aria-label="Principal">
            <NavLink href="/" match={['/', '/eventos', '/comprar']}>
              Eventos
            </NavLink>
            {user ? (
              <NavLink href="/mis-ordenes" match={['/mis-ordenes', '/ingreso', '/disputa']}>
                Mis órdenes
              </NavLink>
            ) : (
              <a className="nav-item nav-optional" href="/#como-funciona">
                Cómo funciona
              </a>
            )}
            <NavLink href="/vender">Vender</NavLink>
            {user?.role === 'admin' ? <NavLink href="/admin">Admin</NavLink> : null}
          </nav>
          <div className="header-tools">
            <ThemeSwitch />
            <div className="header-account">
              {user ? (
                <LogoutButton className="btn sm secondary" />
              ) : (
                <a className="btn sm" href="/ingresar">
                  Ingresar
                </a>
              )}
            </div>
          </div>
        </div>
      </header>
      <HeaderScroll />
    </>
  );
}

/**
 * Phones: the same destinations as a floating bottom bar, within thumb reach. Hidden from tablet
 * up. `tab-fade` is the strip behind it: whatever scrolls under the bar is blurred away there, so
 * no label or card edge ever shows crisp around or below the bar. Every page also reserves the
 * bar's height at its end (the footer's bottom padding), so the last content is fully reachable.
 */
export async function TabBar() {
  const user = await shellUser();
  return (
    <>
      <div className="tab-fade" aria-hidden="true" />
      <nav className="tab-bar" aria-label="Principal">
        <NavLink className="tab-item" href="/" match={['/', '/eventos', '/comprar']}>
          <IconEvents />
          <span>Eventos</span>
        </NavLink>
        {user ? (
          <NavLink className="tab-item" href="/mis-ordenes" match={['/mis-ordenes', '/ingreso', '/disputa']}>
            <IconOrders />
            <span>Órdenes</span>
          </NavLink>
        ) : null}
        <NavLink className="tab-item" href="/vender">
          <IconSell />
          <span>Vender</span>
        </NavLink>
        {user?.role === 'admin' ? (
          <NavLink className="tab-item" href="/admin">
            <IconAdmin />
            <span>Admin</span>
          </NavLink>
        ) : null}
        {user ? (
          <LogoutButton className="tab-item" />
        ) : (
          <NavLink className="tab-item" href="/ingresar">
            <IconUser />
            <span>Ingresar</span>
          </NavLink>
        )}
      </nav>
    </>
  );
}
