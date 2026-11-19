import { describe, expect, it } from 'vitest';
import { SELL_TABS, isActivePath, primaryNav } from './nav';

describe('isActivePath', () => {
  it('matches a section and its children, never a sibling with the same prefix', () => {
    expect(isActivePath('/eventos', ['/eventos'])).toBe(true);
    expect(isActivePath('/eventos/abc', ['/eventos'])).toBe(true);
    expect(isActivePath('/eventosx', ['/eventos'])).toBe(false);
  });

  it('treats "/" and exact matches as exact', () => {
    expect(isActivePath('/', ['/'])).toBe(true);
    expect(isActivePath('/eventos', ['/'])).toBe(false);
    expect(isActivePath('/vender/ventas', ['/vender'], true)).toBe(false);
    expect(isActivePath('/vender', ['/vender'], true)).toBe(true);
  });
});

describe('primaryNav', () => {
  it('everyone sees Inicio, Eventos, Mis órdenes and Vender, in that order', () => {
    expect(primaryNav(null).map((i) => i.href)).toEqual(['/', '/eventos', '/mis-ordenes', '/vender']);
    expect(primaryNav('user').map((i) => i.href)).toEqual(['/', '/eventos', '/mis-ordenes', '/vender']);
  });

  it('admins also see Admin', () => {
    expect(primaryNav('admin').map((i) => i.href)).toEqual(['/', '/eventos', '/mis-ordenes', '/vender', '/admin']);
  });

  it('Inicio is only active on the home page', () => {
    const home = primaryNav(null)[0];
    expect(isActivePath('/', home.match, home.exact)).toBe(true);
    expect(isActivePath('/eventos', home.match, home.exact)).toBe(false);
  });

  it('keeps the buying flow under Eventos and the after-sale pages under Mis órdenes', () => {
    const [, events, orders] = primaryNav('user');
    expect(isActivePath('/comprar/x', events.match)).toBe(true);
    for (const p of ['/ingreso/x', '/disputa/x', '/pago-manual/x']) expect(isActivePath(p, orders.match)).toBe(true);
  });

  it('every Vender sub-page lights up the Vender item', () => {
    const sell = primaryNav(null).find((i) => i.href === '/vender')!;
    expect(isActivePath('/vender/publicaciones', sell.match)).toBe(true);
  });
});

describe('SELL_TABS', () => {
  it('exactly one tab is active on each Vender page', () => {
    for (const path of ['/vender', '/vender/publicaciones', '/vender/ventas']) {
      const active = SELL_TABS.filter((t) => isActivePath(path, [t.href], t.exact));
      expect(active.map((t) => t.href)).toEqual([path]);
    }
  });
});
