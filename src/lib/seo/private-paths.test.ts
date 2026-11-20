import { describe, expect, it } from 'vitest';
import { PRIVATE_PATH_PREFIXES, ROBOTS_DISALLOW, isPrivatePath } from './private-paths';

describe('isPrivatePath', () => {
  it('marks accounts, checkout, orders, disputes, admin and the API as private', () => {
    for (const p of ['/admin', '/admin/pagos', '/api/orders/1', '/ingresar', '/mis-ordenes', '/vender', '/vender/publicaciones', '/vender/ventas', '/comprar/abc', '/disputa/abc', '/ingreso/abc', '/pago-manual/abc', '/pago-de-prueba/ref']) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it('never marks a public, indexable page as private', () => {
    for (const p of ['/', '/eventos', '/eventos/abc', '/como-funciona', '/privacidad', '/terminos', '/cookies', '/reembolsos', '/sitemap.xml', '/robots.txt', '/og-default.png']) {
      expect(isPrivatePath(p), p).toBe(false);
    }
  });

  it('matches whole path segments only', () => {
    expect(isPrivatePath('/ingresarx')).toBe(false);
    expect(isPrivatePath('/vendedores')).toBe(false);
    expect(isPrivatePath('/administracion')).toBe(false);
  });
});

describe('ROBOTS_DISALLOW', () => {
  it('lists every private prefix and no public page', () => {
    expect(ROBOTS_DISALLOW).toHaveLength(PRIVATE_PATH_PREFIXES.length);
    expect(ROBOTS_DISALLOW).toContain('/api/');
    expect(ROBOTS_DISALLOW).toContain('/admin');
    expect(ROBOTS_DISALLOW).not.toContain('/');
    for (const rule of ROBOTS_DISALLOW) expect(['/eventos', '/privacidad', '/terminos', '/cookies', '/reembolsos']).not.toContain(rule);
  });
});
