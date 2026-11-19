import type { ComponentType } from 'react';
import { primaryNav, type NavIcon } from '@/lib/ui/nav';
import { shellUser } from './current-user';
import HeaderScroll from './header-scroll';
import { Brand, IconAdmin, IconEvents, IconHome, IconOrders, IconSell } from './icons';
import LogoutButton from './logout-button';
import NavLink from './nav-link';

const ICONS: Record<NavIcon, ComponentType> = {
  home: IconHome,
  events: IconEvents,
  orders: IconOrders,
  sell: IconSell,
  admin: IconAdmin,
};

/**
 * Top bar: wordmark, segmented section menu (Inicio · Eventos · Mis órdenes · Vender · Cómo funciona)
 * and account button. Sticky with translucent backdrop on scroll. On phones (< 768 px), the
 * floating bottom TabBar holds the 4 primary app destinations while the top bar keeps brand + Ingresar/Salir.
 */
export default async function SiteHeader() {
  const user = await shellUser();
  const items = primaryNav(user?.role ?? null);
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
            {items.map((item) => (
              <NavLink key={item.href} href={item.href} match={item.match} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
            <NavLink href="/como-funciona" className="nav-item nav-optional">
              Cómo funciona
            </NavLink>
          </nav>
          <div className="header-tools">
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
 * Phones: dedicated 4-tab floating dock within thumb reach (`Inicio`, `Eventos`, `Órdenes`, `Vender`),
 * plus `Admin` when applicable. Hidden from tablet up.
 */
export async function TabBar() {
  const user = await shellUser();
  return (
    <>
      <div className="tab-fade" aria-hidden="true" />
      <nav className="tab-bar" aria-label="Principal">
        {primaryNav(user?.role ?? null).map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <NavLink key={item.href} className="tab-item" href={item.href} match={item.match} exact={item.exact}>
              <Icon />
              <span>{item.short}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
