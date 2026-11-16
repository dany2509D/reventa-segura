import { currentUser } from '../session';
import { BrandMark, IconAdmin, IconEvents, IconOrders, IconSell, IconUser } from './icons';
import LogoutButton from './logout-button';
import NavLink from './nav-link';

// Compact top bar (logo + wordmark). On phones the same <nav> is laid out as a bottom tab bar by CSS.
export default async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href="/">
          <BrandMark />
          <span>Reventa Segura</span>
        </a>
        <nav className="site-nav" aria-label="Principal">
          <NavLink href="/" match={['/', '/eventos', '/comprar']}>
            <IconEvents />
            <span>Eventos</span>
          </NavLink>
          {user ? (
            <>
              <NavLink href="/mis-ordenes" match={['/mis-ordenes', '/ingreso', '/disputa']}>
                <IconOrders />
                <span>Mis órdenes</span>
              </NavLink>
              <NavLink href="/vender">
                <IconSell />
                <span>Vender</span>
              </NavLink>
              {user.role === 'admin' ? (
                <NavLink href="/admin">
                  <IconAdmin />
                  <span>Admin</span>
                </NavLink>
              ) : null}
              <LogoutButton />
            </>
          ) : (
            <NavLink href="/ingresar">
              <IconUser />
              <span>Ingresar</span>
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
