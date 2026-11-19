/**
 * The app's navigation model: one source for the header, the phone tab bar and the section tabs,
 * so a destination never exists in one menu and not in another.
 */

export type NavIcon = 'home' | 'events' | 'orders' | 'sell' | 'admin';

export type NavItem = {
  href: string;
  /** Header label. */
  label: string;
  /** Phone tab-bar label (narrow). */
  short: string;
  icon: NavIcon;
  /** Path prefixes that belong to this section. */
  match: string[];
  /** Active on the exact path only. */
  exact?: boolean;
};

export type SectionTab = { href: string; label: string; exact?: boolean };

/** True when `pathname` is one of `match` or below it. "/" and `exact` compare the whole path. */
export function isActivePath(pathname: string, match: readonly string[], exact = false): boolean {
  return match.some((p) => (p === '/' || exact ? pathname === p : pathname === p || pathname.startsWith(`${p}/`)));
}

export function primaryNav(role: 'user' | 'admin' | null): NavItem[] {
  const items: NavItem[] = [
    { href: '/', label: 'Inicio', short: 'Inicio', icon: 'home', match: ['/'], exact: true },
    { href: '/eventos', label: 'Eventos', short: 'Eventos', icon: 'events', match: ['/eventos', '/comprar'] },
    {
      href: '/mis-ordenes',
      label: 'Mis órdenes',
      short: 'Órdenes',
      icon: 'orders',
      match: ['/mis-ordenes', '/ingreso', '/disputa', '/pago-manual'],
    },
    { href: '/vender', label: 'Vender', short: 'Vender', icon: 'sell', match: ['/vender'] },
  ];
  if (role === 'admin') items.push({ href: '/admin', label: 'Admin', short: 'Admin', icon: 'admin', match: ['/admin'] });
  return items;
}

export const SELL_TABS: readonly SectionTab[] = [
  { href: '/vender', label: 'Publicar', exact: true },
  { href: '/vender/publicaciones', label: 'Mis publicaciones' },
  { href: '/vender/ventas', label: 'Mis ventas' },
];
