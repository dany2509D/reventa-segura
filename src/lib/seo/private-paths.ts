/**
 * Pages that belong to one person or to the team (account, checkout, orders, disputes, admin) and
 * the sandbox payment page. They never appear in search results: robots.txt asks crawlers to skip
 * them AND the proxy answers them with `X-Robots-Tag: noindex, nofollow`, so a link to one that
 * leaks somewhere still cannot be indexed. Everything NOT listed here is public and indexable;
 * private-paths.test.ts pins both sides so a public page can never get noindex by accident.
 */
export const PRIVATE_PATH_PREFIXES = [
  '/admin',
  '/api',
  '/ingresar',
  '/mis-ordenes',
  '/vender',
  '/comprar',
  '/disputa',
  '/ingreso',
  '/pago-manual',
  '/pago-de-prueba',
] as const;

/** Segment-aware: "/ingreso/1" is private, "/ingresarx" is not, and "/ingresar" is not "/ingreso". */
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The `Disallow` lines for robots.txt: the prefixes, with a trailing slash where the page has an id after it. */
export const ROBOTS_DISALLOW: string[] = PRIVATE_PATH_PREFIXES.map((p) => (['/api', '/comprar', '/disputa', '/ingreso', '/pago-manual', '/pago-de-prueba'].includes(p) ? `${p}/` : p));
