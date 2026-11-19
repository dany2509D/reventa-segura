# Secciones de la app (Eventos · Órdenes · Vender) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app deje de sentirse como una landing de una sola página: un menú lleva a tres secciones separadas (Eventos, Órdenes, Vender), cada una con su propia cabecera y su color, y la home queda como portada.

**Architecture:** La navegación sale de un único modelo puro (`src/lib/ui/nav.ts`), que usan el header, la barra inferior móvil y las pestañas de sección. Dos componentes compartidos (`SectionShell` y `SectionNav`) dan a cada sección su cabecera y su acento por `data-section`, usando los tokens que ya existen (`--sky-soft`, `--mint-soft`, `--sun-soft`). La agenda y el buscador salen de la home y pasan a `/eventos`. `/mis-ordenes` queda solo con compras. Ventas y publicaciones pasan a `/vender/*`, con un layout de pestañas. En el backend solo se toca `src/lib/account/queries.ts`: se agregan `eventId` y `startsAt` a las consultas del vendedor.

**Tech Stack:** Next.js 16 App Router (Server Components, `searchParams` como Promise), React 19, CSS plano con tokens en `src/app/globals.css`, Drizzle + PGlite, Vitest (entorno `node`, solo `src/**/*.test.ts`).

## Global Constraints

- Next 16 tiene cambios incompatibles: antes de usar una API de Next, leer `node_modules/next/dist/docs/` (lo pide `AGENTS.md`).
- Interfaz en español. Los comentarios de código van en inglés, como en el resto del repo.
- La navegación usa `<a href>` (navegación completa, con view transitions de CSS), no `next/link`. Mantenerlo así.
- Solo tokens existentes de `globals.css`: nada de colores hex nuevos. El modo oscuro tiene que funcionar sin reglas extra.
- Sin dependencias nuevas.
- Vitest solo corre archivos `.test.ts` en entorno `node`: no hay tests de componentes. La lógica se testea como funciones puras y la UI se verifica en el navegador.
- Commits sin trailers de coautoría ni menciones a herramientas de IA.
- El repo es de un compañero: la entrega es un PR para que lo apruebe, nunca merge directo a `main`.
- La verificación de celular (`phoneVerifiedAt`) se exige solo para **publicar** (`/vender`), no para ver publicaciones ni ventas.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/ui/nav.ts` (+ `.test.ts`) | Crear | Modelo de navegación: `isActivePath`, `primaryNav`, `SELL_TABS`, `catalogUrl` |
| `src/app/_components/nav-link.tsx` | Modificar | Usar `isActivePath` |
| `src/app/_components/site-header.tsx` | Modificar | Header y barra inferior a partir de `primaryNav` |
| `src/app/_components/section-shell.tsx` / `.css` | Crear | Cabecera de sección con acento por `data-section` |
| `src/app/_components/section-nav.tsx` | Crear | Pestañas de sección (mismo patrón que el panel admin) |
| `src/app/eventos/page.tsx` | Crear | Cartelera: buscador + agenda + filtros, con `?q=` |
| `src/app/_home/*`, `src/app/page.tsx` | Modificar | La home sin agenda; el buscador lleva a `/eventos?q=` |
| `src/lib/account/escrow.ts` (+ test) | Crear | `escrowStages` extraído de `mis-ordenes/page.tsx` |
| `src/lib/account/earnings.ts` (+ test) | Crear | `sellerEarnings`: retenido / por pagar / pagado |
| `src/app/_components/escrow-track.tsx` | Crear | Barra de etapas del escrow, compartida |
| `src/lib/account/queries.ts` (+ test) | Modificar | `eventId` y `startsAt` en `sellerListings`/`sellerSales` |
| `src/app/vender/layout.tsx` | Crear | Shell de Vender y pestañas |
| `src/app/vender/publicaciones/page.tsx`, `src/app/vender/ventas/page.tsx` | Crear | Secciones movidas desde `mis-ordenes` |
| `src/app/mis-ordenes/page.tsx` | Modificar | Solo compras, con shell propio |

---

### Task 0: Base limpia (cambios pendientes y hallazgos de la revisión)

Hoy hay 54 archivos modificados sin commit en `main` (rediseño visual). Este plan trabaja encima de ese rediseño, así que primero se guarda en commits separados, como recomendó la revisión.

**Files:**
- Modify: `src/lib/auth/auth.test.ts:81-93`
- Modify: `src/lib/ui/event-cover.ts` (el `alt` de la portada)
- Delete: los duplicados de Finder en `.next/` (`* 2.ts`)

- [ ] **Step 1: Crear rama con los cambios actuales**

```bash
cd ~/Desktop/reventa-segura-ui
git switch -c ui/rediseno
```

- [ ] **Step 2: Test que fija el arreglo del bucle de "Vender"**

En `src/lib/auth/auth.test.ts`, dentro de `it('verifies the right code, creating user and session', …)`, después de `expect(u.identityStatus).toBe('none');` agregar:

```ts
    // A fake-SMS login proves the phone too; without this /vender bounced back to /ingresar.
    expect(u.phoneVerifiedAt).toEqual(now);
```

Run: `npx vitest run src/lib/auth/auth.test.ts`
Expected: PASS (el cambio de `src/lib/auth/otp.ts:138-142` ya está en el árbol).

- [ ] **Step 3: Commit del arreglo de auth, separado**

```bash
git add src/lib/auth/otp.ts src/lib/auth/auth.test.ts src/app/ingresar/page.tsx
git commit -m "fix(auth): marcar el celular como verificado al ingresar por SMS

Sin phoneVerifiedAt, /vender redirigía a /ingresar y este volvía a /vender (bucle)."
```

- [ ] **Step 4: Portadas decorativas para lectores de pantalla**

En `src/lib/ui/event-cover.ts`, cambiar el `alt` que devuelve `eventCoverImage` de `alt: name` a `alt: ''`: el nombre del evento ya está escrito al lado de la imagen. Si `src/lib/ui/event-cover.test.ts` comprueba el `alt`, actualizar la expectativa a `''`.

Run: `npx vitest run src/lib/ui/event-cover.test.ts`
Expected: PASS

- [ ] **Step 5: Limpiar duplicados y verificar**

```bash
find .next -name '* 2.*' -delete
npx tsc --noEmit
npx vitest run
```
Expected: `tsc` sin errores. Vitest con 4 fallos que **ya existen en `700fa88`** (2 en `src/proxy.test.ts`, 2 en `src/lib/auth/routes.test.ts`). Esos se anotan en el PR y no se arreglan en este plan.

- [ ] **Step 6: Commit del rediseño visual**

```bash
git add -A -- . ':!docs/superpowers/plans/2026-11-18-secciones-de-la-app.md'
git status --short   # revisar que no entre .env ni nada de .next
git commit -m "style: rediseño visual de la IU (tema del sistema, portadas, tipografía y movimiento)"
git add docs/superpowers/plans/2026-11-18-secciones-de-la-app.md
git commit -m "docs: plan de secciones de la app"
```

- [ ] **Step 7: Rama para este plan**

```bash
git switch -c ui/secciones
```

---

### Task 1: Modelo de navegación sobre el menú existente

> **Revisado el 2026-11-18.** Otra sesión ya dejó (commit del Task 0) un header con Inicio · Eventos · Mis órdenes · Vender · Cómo funciona, una barra móvil de 4 pestañas, `/eventos`, `/como-funciona` y portales en la home. Esta tarea **no cambia ese diseño**: extrae los destinos a un modelo puro con tests para que header, barra móvil y pestañas no se desincronicen.

**Files:**
- Create: `src/lib/ui/nav.ts`
- Test: `src/lib/ui/nav.test.ts`
- Modify: `src/app/_components/nav-link.tsx` (lógica de activo)
- Modify: `src/app/_components/site-header.tsx` (renderizar desde `primaryNav`)

**Interfaces:**
- Produces:
  - `isActivePath(pathname: string, match: readonly string[], exact?: boolean): boolean`
  - `type NavIcon = 'home' | 'events' | 'orders' | 'sell' | 'admin'`
  - `type NavItem = { href: string; label: string; short: string; icon: NavIcon; match: string[]; exact?: boolean }`
  - `primaryNav(role: 'user' | 'admin' | null): NavItem[]`
  - `type SectionTab = { href: string; label: string; exact?: boolean }`
  - `SELL_TABS: readonly SectionTab[]`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/ui/nav.test.ts`:

```ts
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
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/ui/nav.test.ts`
Expected: FAIL, `Failed to resolve import "./nav"`.

- [ ] **Step 3: Implementación mínima**

`src/lib/ui/nav.ts`:

```ts
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
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/ui/nav.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: `NavLink` usa `isActivePath`**

En `src/app/_components/nav-link.tsx` importar `import { isActivePath } from '@/lib/ui/nav';` y reemplazar el cálculo inline de `active` (el `.some(...)` sobre `match ?? [href]`) por:

```tsx
  const active = isActivePath(pathname, match ?? [href], exact);
```

- [ ] **Step 6: Header y barra móvil desde `primaryNav`, mismo resultado visual**

En `src/app/_components/site-header.tsx`:
- Agregar imports: `import type { ComponentType } from 'react';` y `import { primaryNav, type NavIcon } from '@/lib/ui/nav';`
- Agregar el mapa:

```tsx
const ICONS: Record<NavIcon, ComponentType> = {
  home: IconHome,
  events: IconEvents,
  orders: IconOrders,
  sell: IconSell,
  admin: IconAdmin,
};
```

- En `SiteHeader`, reemplazar los `NavLink` fijos de Inicio, Eventos, Mis órdenes, Vender y Admin por el mapeo; "Cómo funciona" queda fijo, después de los items, como hoy:

```tsx
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
```

  con `const items = primaryNav(user?.role ?? null);` al inicio de la función. Ojo: hoy "Admin" va después de "Cómo funciona"; con el mapeo queda antes. Es aceptable.
- En `TabBar`, reemplazar los `NavLink` fijos por:

```tsx
        {primaryNav(user?.role ?? null).map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <NavLink key={item.href} className="tab-item" href={item.href} match={item.match} exact={item.exact}>
              <Icon />
              <span>{item.short}</span>
            </NavLink>
          );
        })}
```

- Borrar imports de iconos que queden sin uso. No cambiar comentarios de diseño salvo para reflejar que los destinos salen de `primaryNav`.

- [ ] **Step 7: Verificar tipos y tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/ui`
Expected: sin errores; PASS. El HTML del header/barra debe ser equivalente al anterior (mismos enlaces, mismo orden salvo Admin).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/nav.ts src/lib/ui/nav.test.ts src/app/_components/nav-link.tsx src/app/_components/site-header.tsx
git commit -m "refactor(nav): destinos del menú desde un modelo único con tests"
```

---

### Task 2: Shell de sección y cabecera propia de Eventos

> **Revisado el 2026-11-18.** `/eventos`, la búsqueda que navega desde la home y la home sin agenda ya existen (otra sesión). Esta tarea crea el shell compartido de sección y lo aplica a `/eventos` sin perder lo que esa página ya hace (buscador `mode="filter"`, agenda en grilla con selector de vista).

**Files:**
- Create: `src/app/_components/section-shell.tsx`
- Create: `src/app/_components/section-shell.css`
- Create: `src/app/_components/section-nav.tsx`
- Modify: `src/app/eventos/page.tsx`
- Modify: `src/app/pago-manual/[orderId]/proof-form.tsx:52`

**Interfaces:**
- Consumes: `SectionTab` (Task 1)
- Produces:
  - `SectionShell({ tone: 'eventos' | 'ordenes' | 'vender'; eyebrow: string; title: string; titleId?: string; lead?: string; aside?: ReactNode; nav?: ReactNode; children: ReactNode })`: renderiza el `<main>` de la página
  - `SectionNav({ label: string; tabs: readonly SectionTab[] })`
  - Clases CSS: `.section-stats`, `.section-stat`, `.section-panel`

- [ ] **Step 1: `SectionShell` + CSS**

`src/app/_components/section-shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import './section-shell.css';

export type SectionTone = 'eventos' | 'ordenes' | 'vender';

type Props = {
  tone: SectionTone;
  eyebrow: string;
  title: string;
  /** id for the h1 when something focuses it (e.g. the catalogue search moves focus to it). */
  titleId?: string;
  lead?: string;
  /** Right-hand side of the header: figures or a search box for this section. */
  aside?: ReactNode;
  /** Section tabs, under the header. */
  nav?: ReactNode;
  children: ReactNode;
};

/**
 * The page frame of an app section. Each section has its own accent (data-section → --section*),
 * so Eventos, Órdenes and Vender read as different places while sharing one layout.
 */
export default function SectionShell({ tone, eyebrow, title, titleId, lead, aside, nav, children }: Props) {
  return (
    <main className="page wide section-page" data-section={tone}>
      <header className="section-hero">
        <div className="section-hero-copy">
          <p className="eyebrow">
            <span className="dot" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 id={titleId} tabIndex={titleId ? -1 : undefined}>
            {title}
          </h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {aside ? <div className="section-hero-aside">{aside}</div> : null}
      </header>
      {nav}
      {children}
    </main>
  );
}
```

`src/app/_components/section-shell.css`:

```css
/* Section accents: existing tokens only, so dark mode follows globals.css. */
.section-page[data-section='eventos'] { --section: var(--accent); --section-soft: var(--sky-soft); --section-ink: var(--accent-ink); }
.section-page[data-section='ordenes'] { --section: var(--accent-2); --section-soft: var(--mint-soft); --section-ink: var(--accent-2-ink); }
.section-page[data-section='vender'] { --section: var(--warning); --section-soft: var(--sun-soft); --section-ink: var(--warning); }

.section-hero {
  position: relative;
  display: grid;
  gap: var(--space-5);
  padding: var(--space-8) var(--space-6);
  margin-bottom: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--section-soft), var(--surface) 70%);
  overflow: hidden;
}
.section-hero::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--section);
}
.section-hero .eyebrow { margin-bottom: var(--space-3); }
.section-hero .eyebrow .dot { background: var(--section); box-shadow: 0 0 0 1px var(--section-ink); }
.section-hero h1 { margin: 0 0 var(--space-3); }
.section-hero h1:focus { outline: none; }
.section-hero .lead { margin: 0; max-width: 56ch; }
@media (min-width: 768px) {
  .section-hero { grid-template-columns: minmax(0, 1fr) minmax(0, auto); align-items: end; }
}
.section-hero-aside { min-width: 0; }
@media (min-width: 768px) {
  .section-page[data-section='eventos'] .section-hero-aside { width: min(440px, 40vw); }
}

.section-stats { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.section-stat {
  min-width: 120px;
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.section-stat strong { display: block; font-size: 1.5rem; color: var(--section-ink); font-variant-numeric: tabular-nums; }
.section-stat span { color: var(--text-muted); font-size: var(--fs-small); }
.section-panel > .section-stats { margin-bottom: var(--space-6); }

/* Tabs: same shape as the admin panel's, tinted with the section accent. */
.section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  margin-bottom: var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
@media (max-width: 767.98px) {
  .section-nav { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .section-nav::-webkit-scrollbar { display: none; }
}
.section-tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-weight: 500;
  font-size: var(--fs-small);
  text-decoration: none;
}
.section-tab:hover { background: var(--surface-2); color: var(--text); }
.section-tab[aria-current='page'] { background: var(--section-soft); color: var(--section-ink); font-weight: 650; }
@media (forced-colors: active) {
  .section-tab[aria-current='page'] { outline: 2px solid CanvasText; }
}

.section-panel > .section-title:first-child { margin-top: 0; }
```

- [ ] **Step 2: `SectionNav`**

`src/app/_components/section-nav.tsx`:

```tsx
import type { SectionTab } from '@/lib/ui/nav';
import NavLink from './nav-link';
import './section-shell.css';

/** Tabs between the pages of one section. Active state comes from NavLink (aria-current). */
export default function SectionNav({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.exact} pill={false} className="section-tab">
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: `/eventos` dentro del shell**

Reescribir el JSX de `src/app/eventos/page.tsx` conservando sus datos, su `metadata`, el `SearchProvider initialQuery`, `EventSearch mode="filter"` y las props actuales de `EventAgenda` (`defaultView="grid" showViewToggle showHeader={false}`). Quitar el `<main className="container catalog-page">`, el `<div className="catalog-top">` y el `<header className="page-head">` propios, y usar:

```tsx
    <SearchProvider initialQuery={initialQuery}>
      <SectionShell
        tone="eventos"
        eyebrow={`Cartelera · ${eventCountLabel(totals.events)} · ${ticketCountLabel(totals.listings)}`}
        title="Eventos en Panamá"
        titleId="eventos-title"
        lead="Explora conciertos, partidos y obras con entregas verificadas y dinero retenido en escrow."
        aside={<EventSearch events={events} mode="filter" initialQuery={initialQuery} />}
      >
        <EventAgenda events={events} defaultView="grid" showViewToggle showHeader={false} />
      </SectionShell>
    </SearchProvider>
```

Importar `SectionShell from '../_components/section-shell'`. `titleId="eventos-title"` es obligatorio: `event-search.tsx` mueve el foco a ese id tras buscar, y `event-agenda.tsx` usa `aria-labelledby="eventos-title"` cuando `showHeader={false}`.

Después: `grep -rn "catalog-page\|catalog-top" src/app`. Si solo quedan en `home.css`, borrar esas reglas (líneas ~840-845).

- [ ] **Step 4: Enlace que volvía a la home para ver eventos**

`src/app/pago-manual/[orderId]/proof-form.tsx:52`: `<a href="/">Volver a los eventos</a>` → `<a href="/eventos">Volver a los eventos</a>`

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; solo los 4 fallos previos del Task 0.

Navegador (servidor de desarrollo; si ya hay uno en `http://localhost:3100/`, usarlo):
1. `/eventos`: cabecera con borde azul y degradado, buscador a la derecha en escritorio y debajo en móvil (390 px), agenda en grilla con su selector de vista.
2. Escribir en el buscador: filtra en el sitio; Enter enfoca el título sin saltos raros.
3. `/eventos?q=algo`: llega filtrado y con el texto en el buscador.
4. Modo oscuro del sistema: cabecera legible, contraste correcto.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/section-shell.tsx src/app/_components/section-shell.css src/app/_components/section-nav.tsx \
  src/app/eventos/page.tsx src/app/pago-manual/[orderId]/proof-form.tsx src/app/_home/home.css
git commit -m "feat(eventos): shell de sección con acento propio aplicado a la cartelera"
```

---

### Task 3: Lógica de cuenta (escrow, ganancias y portadas del vendedor)

**Files:**
- Create: `src/lib/account/escrow.ts`, Test: `src/lib/account/escrow.test.ts`
- Create: `src/lib/account/earnings.ts`, Test: `src/lib/account/earnings.test.ts`
- Create: `src/app/_components/escrow-track.tsx`
- Modify: `src/lib/account/queries.ts:73-112`
- Modify: `src/lib/account/queries.test.ts:64-77`

**Interfaces:**
- Produces:
  - `type StageClass = '' | 'is-done' | 'is-alert'`
  - `escrowStages(state: OrderState): [StageClass, StageClass, StageClass] | null`
  - `type Earnings = { heldCents: number; queuedCents: number; paidCents: number }`
  - `sellerEarnings(sales: readonly { state: OrderState; netCents: number; payoutStatus: 'queued' | 'paid' | null }[]): Earnings`
  - `EscrowTrack({ state: OrderState; labels: readonly [string, string, string] })`
  - Filas de `sellerListings`: se agregan `eventId: string`, y `startsAt: Date` ya existe
  - Filas de `sellerSales`: se agregan `eventId: string`, `startsAt: Date`

- [ ] **Step 1: Tests que fallan (escrow y ganancias)**

`src/lib/account/escrow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escrowStages } from './escrow';

describe('escrowStages', () => {
  it('walks held → delivered → closed', () => {
    expect(escrowStages('creada')).toEqual(['', '', '']);
    expect(escrowStages('transferencia_pendiente')).toEqual(['is-done', '', '']);
    expect(escrowStages('comprobante_en_revision')).toEqual(['is-done', '', '']);
    expect(escrowStages('entrada_recibida')).toEqual(['is-done', 'is-done', '']);
    expect(escrowStages('ingreso_confirmado')).toEqual(['is-done', 'is-done', '']);
    expect(escrowStages('liberada')).toEqual(['is-done', 'is-done', 'is-done']);
    expect(escrowStages('liquidada')).toEqual(['is-done', 'is-done', 'is-done']);
  });

  it('flags a dispute on the delivery stage and hides the track for dead orders', () => {
    expect(escrowStages('disputada')).toEqual(['is-done', 'is-alert', '']);
    expect(escrowStages('reembolsada')).toBeNull();
    expect(escrowStages('cancelada')).toBeNull();
  });
});
```

`src/lib/account/earnings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sellerEarnings } from './earnings';

describe('sellerEarnings', () => {
  it('splits net amounts into held, queued for payout and paid', () => {
    expect(
      sellerEarnings([
        { state: 'entrada_recibida', netCents: 4500, payoutStatus: null },
        { state: 'disputada', netCents: 1000, payoutStatus: null },
        { state: 'liberada', netCents: 3000, payoutStatus: 'queued' },
        { state: 'liquidada', netCents: 2000, payoutStatus: 'paid' },
      ]),
    ).toEqual({ heldCents: 5500, queuedCents: 3000, paidCents: 2000 });
  });

  it('ignores unpaid, refunded and cancelled orders', () => {
    expect(
      sellerEarnings([
        { state: 'creada', netCents: 9999, payoutStatus: null },
        { state: 'reembolsada', netCents: 9999, payoutStatus: null },
        { state: 'cancelada', netCents: 9999, payoutStatus: null },
      ]),
    ).toEqual({ heldCents: 0, queuedCents: 0, paidCents: 0 });
  });

  it('is zero for no sales', () => {
    expect(sellerEarnings([])).toEqual({ heldCents: 0, queuedCents: 0, paidCents: 0 });
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/lib/account/escrow.test.ts src/lib/account/earnings.test.ts`
Expected: FAIL, `Failed to resolve import "./escrow"` / `"./earnings"`.

- [ ] **Step 3: Implementación**

`src/lib/account/escrow.ts`:

```ts
import type { OrderState } from '@/lib/orders/state-machine';

export type StageClass = '' | 'is-done' | 'is-alert';

/**
 * The three escrow stages an order card shows (held, delivered, closed) as CSS state classes.
 * Null for orders that ended without a sale: they have no track to show.
 */
export function escrowStages(state: OrderState): [StageClass, StageClass, StageClass] | null {
  switch (state) {
    case 'reembolsada':
    case 'cancelada':
      return null;
    case 'disputada':
      return ['is-done', 'is-alert', ''];
    case 'liberada':
    case 'liquidada':
      return ['is-done', 'is-done', 'is-done'];
    case 'entrada_recibida':
    case 'ingreso_confirmado':
      return ['is-done', 'is-done', ''];
    case 'transferencia_pendiente':
    case 'comprobante_en_revision':
      return ['is-done', '', ''];
    case 'creada':
      return ['', '', ''];
  }
}
```

`src/lib/account/earnings.ts`:

```ts
import type { OrderState } from '@/lib/orders/state-machine';

export type Earnings = { heldCents: number; queuedCents: number; paidCents: number };

type Sale = { state: OrderState; netCents: number; payoutStatus: 'queued' | 'paid' | null };

/** Orders that never paid the seller, or never will. */
const NOT_EARNED: ReadonlySet<OrderState> = new Set<OrderState>(['creada', 'reembolsada', 'cancelada']);

/** The seller's money by stage: still held in escrow, queued for payout, already paid. */
export function sellerEarnings(sales: readonly Sale[]): Earnings {
  const out: Earnings = { heldCents: 0, queuedCents: 0, paidCents: 0 };
  for (const s of sales) {
    if (NOT_EARNED.has(s.state)) continue;
    if (s.payoutStatus === 'paid') out.paidCents += s.netCents;
    else if (s.payoutStatus === 'queued') out.queuedCents += s.netCents;
    else out.heldCents += s.netCents;
  }
  return out;
}
```

Si `tsc` reclama que el `switch` de `escrowStages` no devuelve en todos los caminos, es porque `OrderState` tiene un estado que no está en la lista. En ese caso, agregarlo al `case` que le corresponda según `src/lib/orders/state-machine.ts`, sin usar `default`.

- [ ] **Step 4: Ver que pasan**

Run: `npx vitest run src/lib/account/escrow.test.ts src/lib/account/earnings.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Test que falla: las consultas del vendedor traen el evento**

En `src/lib/account/queries.test.ts`, test `"shows the seller's listings with status, …"`:
- Cambiar la expectativa de `l[0]` a:

```ts
    expect(l[0]).toMatchObject({ listingId: a.listing.id, eventId: a.event.id, status: 'sold', askCents: 5000, eventName: 'Concierto' });
```

- Cambiar la de `s` a:

```ts
    expect(s).toEqual([
      expect.objectContaining({
        orderId: a.order.id,
        eventId: a.event.id,
        startsAt: a.event.startsAt,
        state: 'liberada',
        netCents: 4500,
        payoutStatus: 'queued',
        eventName: 'Concierto',
      }),
    ]);
```

Run: `npx vitest run src/lib/account/queries.test.ts`
Expected: FAIL; falta `eventId` (y `startsAt` en ventas).

- [ ] **Step 6: Agregar los campos**

En `src/lib/account/queries.ts`:
- `sellerListings`, dentro de `.select({ … })`, después de `listingId: listings.id,`: `eventId: events.id,`
- `sellerSales`, dentro de `.select({ … })`, después de `orderId: orders.id,`: `eventId: events.id,` y `startsAt: events.startsAt,`

Run: `npx vitest run src/lib/account/queries.test.ts`
Expected: PASS

- [ ] **Step 7: Componente `EscrowTrack`**

`src/app/_components/escrow-track.tsx`:

```tsx
import { escrowStages } from '@/lib/account/escrow';
import type { OrderState } from '@/lib/orders/state-machine';

/** The order card's escrow progress. Decorative: the status chip next to it carries the meaning. */
export default function EscrowTrack({ state, labels }: { state: OrderState; labels: readonly [string, string, string] }) {
  const stages = escrowStages(state);
  if (!stages) return null;
  return (
    <div className="escrow-track" aria-hidden="true">
      {stages.map((cls, i) => (
        <div key={labels[i]} className={`escrow-stage ${cls}`}>
          <span>{labels[i]}</span>
          <span className="escrow-bar" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Verificar y commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/account`
Expected: sin errores; PASS.

```bash
git add src/lib/account/escrow.ts src/lib/account/escrow.test.ts src/lib/account/earnings.ts src/lib/account/earnings.test.ts \
  src/lib/account/queries.ts src/lib/account/queries.test.ts src/app/_components/escrow-track.tsx
git commit -m "feat(cuenta): etapas de escrow, resumen de ganancias y evento en las consultas del vendedor"
```

---

### Task 4: Sección Vender con pestañas (Publicar · Mis publicaciones · Mis ventas)

**Files:**
- Create: `src/app/vender/layout.tsx`
- Create: `src/app/vender/publicaciones/page.tsx`
- Create: `src/app/vender/ventas/page.tsx`
- Move: `src/app/mis-ordenes/withdraw-button.tsx` → `src/app/vender/withdraw-button.tsx`
- Modify: `src/app/vender/page.tsx` (cabecera y enlaces)
- Modify: `src/app/vender/listing-form.tsx:107`

**Interfaces:**
- Consumes: `SectionShell`, `SectionNav` (Task 2); `SELL_TABS` (Task 1); `EscrowTrack`, `sellerEarnings`, `eventId`/`startsAt` en las consultas (Task 3)

- [ ] **Step 1: Layout de Vender**

`src/app/vender/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SELL_TABS } from '@/lib/ui/nav';
import SectionNav from '../_components/section-nav';
import SectionShell from '../_components/section-shell';
import { requireUser } from '../session';

/**
 * The seller's area. Signing in is required for every tab; the phone check stays on the publish
 * page only, so a member can always see their listings and sales.
 */
export default async function SellLayout({ children }: { children: ReactNode }) {
  await requireUser('/vender');
  return (
    <SectionShell
      tone="vender"
      eyebrow="Tu espacio de vendedor"
      title="Vender"
      lead="Publica entradas, sigue su revisión y cobra después del evento."
      nav={<SectionNav label="Secciones de venta" tabs={SELL_TABS} />}
    >
      {children}
    </SectionShell>
  );
}
```

- [ ] **Step 2: La página de publicar deja de ser un `<main>` propio**

En `src/app/vender/page.tsx`:
- `<main className="page wide">` → `<section className="section-panel" aria-labelledby="sell-title">`; el `</main>` final → `</section>`.
- `<h1>Vender una entrada</h1>` → `<h2 id="sell-title">Publicar una entrada</h2>`
- Los dos `href="/"` (líneas 90 y 98) → `href="/eventos"`.
- `export const metadata = { title: 'Vender una entrada' };` se queda igual.
- No tocar `requireUser('/vender')` ni la redirección por `phoneVerifiedAt`.

En `src/app/vender/listing-form.tsx:107` reemplazar `Puedes seguirla en <a href="/mis-ordenes">Mis órdenes</a>.` por `Puedes seguirla en <a href="/vender/publicaciones">Mis publicaciones</a>.`

- [ ] **Step 3: Mover el botón de retirar**

```bash
git mv src/app/mis-ordenes/withdraw-button.tsx src/app/vender/withdraw-button.tsx
```

Su import `'../_components/confirm-dialog'` sigue siendo válido (misma profundidad).

- [ ] **Step 4: Mis publicaciones**

`src/app/vender/publicaciones/page.tsx`:

```tsx
import { listingStatusLabel, type ListingStatus } from '@/lib/account/labels';
import { sellerListings } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../../_components/empty-state';
import EventPoster from '../../_components/event-poster';
import { requireUser } from '../../session';
import WithdrawButton from '../withdraw-button';

export const metadata = { title: 'Mis publicaciones' };
export const dynamic = 'force-dynamic';

const LISTING_TONE: Record<ListingStatus, string> = {
  pending: 'chip warning',
  verified: 'chip info',
  rejected: 'chip danger',
  sold: 'chip success',
  withdrawn: 'chip neutral',
};

export default async function MyListingsPage() {
  const user = await requireUser('/vender/publicaciones');
  const mine = await sellerListings(getDb(), user.userId);

  return (
    <section className="section-panel" aria-labelledby="listings-title">
      <h2 id="listings-title" className="section-title">
        Mis publicaciones <span className="count">{String(mine.length).padStart(2, '0')}</span>
      </h2>
      {mine.length === 0 ? (
        <EmptyState>
          <p>No has publicado entradas.</p>
          <a className="btn sm secondary" href="/vender">Publicar una entrada</a>
        </EmptyState>
      ) : (
        <div className="list-group">
          {mine.map((l) => (
            <div key={l.listingId} className="list-row listing-thumb-row">
              <div className="listing-thumb">
                <EventPoster seed={l.eventId} title={l.eventName} image={eventCoverImage(l.eventId, l.eventName)} size="thumb" sizes="44px" />
              </div>
              <div className="list-label">
                {l.eventName}
                <div className="list-sub">
                  <span className="muted">{formatPanamaDateTime(l.startsAt)}</span>
                  <span className="muted money">{formatUsd(l.askCents)}</span>
                  <span className={LISTING_TONE[l.status]}>{listingStatusLabel(l.status)}</span>
                </div>
              </div>
              {l.status === 'pending' || l.status === 'verified' ? <WithdrawButton listingId={l.listingId} eventName={l.eventName} /> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Mis ventas, con el resumen de ganancias**

`src/app/vender/ventas/page.tsx`:

```tsx
import { sellerEarnings } from '@/lib/account/earnings';
import { orderStatusLabel, sellerNextStep } from '@/lib/account/labels';
import { sellerSales } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../../_components/empty-state';
import EscrowTrack from '../../_components/escrow-track';
import EventPoster from '../../_components/event-poster';
import { requireUser } from '../../session';

export const metadata = { title: 'Mis ventas' };
export const dynamic = 'force-dynamic';

const SELLER_TONE: Record<OrderState, string> = {
  creada: '',
  comprobante_en_revision: '',
  transferencia_pendiente: 'pastel tone-sun',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: 'is-closed',
  cancelada: 'is-closed',
};
const SELLER_STAGES = ['Retenido', 'Entregada', 'Liquidado'] as const;

export default async function MySalesPage() {
  const user = await requireUser('/vender/ventas');
  const sales = await sellerSales(getDb(), user.userId);
  const money = sellerEarnings(sales);

  return (
    <section className="section-panel" aria-labelledby="sales-title">
      <ul className="section-stats" aria-label="Tus ganancias">
        <li className="section-stat">
          <strong className="money">{formatUsd(money.heldCents)}</strong>
          <span>Retenido en escrow</span>
        </li>
        <li className="section-stat">
          <strong className="money">{formatUsd(money.queuedCents)}</strong>
          <span>Por pagarte</span>
        </li>
        <li className="section-stat">
          <strong className="money">{formatUsd(money.paidCents)}</strong>
          <span>Pagado</span>
        </li>
      </ul>

      <h2 id="sales-title" className="section-title">
        Mis ventas <span className="count">{String(sales.length).padStart(2, '0')}</span>
      </h2>
      {sales.length === 0 ? (
        <EmptyState>
          <p>Aún no tienes ventas.</p>
          <p className="muted">Cuando alguien compre una de tus entradas publicadas, la verás aquí.</p>
        </EmptyState>
      ) : (
        <div className="orders-grid">
          {sales.map((s, i) => (
            <article key={s.orderId} className={`card order-card reveal reveal-${Math.min(i, 4)} ${SELLER_TONE[s.state]}`}>
              <div className="order-top">
                <div className="order-thumb">
                  <EventPoster seed={s.eventId} title={s.eventName} image={eventCoverImage(s.eventId, s.eventName)} size="thumb" sizes="56px" />
                </div>
                <div className="order-title-row">
                  <div>
                    <h3>{s.eventName}</h3>
                    <div className="muted money">
                      {formatPanamaDateTime(s.startsAt)} · Cobro neto: {formatUsd(s.netCents)}
                    </div>
                  </div>
                  <span className="chip">{orderStatusLabel(s.state)}</span>
                </div>
              </div>
              <EscrowTrack state={s.state} labels={SELLER_STAGES} />
              <p>{sellerNextStep({ state: s.state, deliveryMode: s.deliveryMode, payoutStatus: s.payoutStatus })}</p>
              {s.state === 'transferencia_pendiente' && s.transferDeadline ? (
                <p className="notice warning">Transfiere la entrada antes de {formatPanamaDateTime(s.transferDeadline)}.</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```


- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; solo los 4 fallos previos.

Navegador, con sesión de un usuario que tenga el celular verificado (seed dev):
1. `/vender`: cabecera naranja "Vender" y pestaña "Publicar" activa; el formulario o el paso de identidad se ven igual que antes.
2. `/vender/publicaciones`: listado; "Retirar" abre el diálogo de confirmación; la portada coincide con la del evento.
3. `/vender/ventas`: las tres cifras y las tarjetas con su barra de escrow.
4. Usuario **sin** celular verificado: `/vender/publicaciones` y `/vender/ventas` abren sin redirigir; `/vender` sí pide verificar.
5. Sin sesión: las tres rutas mandan a `/ingresar?next=%2Fvender`.
6. Móvil a 390 px: las pestañas se desplazan en horizontal y "Vender" queda activo en la barra inferior.

- [ ] **Step 7: Commit**

```bash
git add src/app/vender
git commit -m "feat(vender): sección con pestañas para publicar, ver publicaciones y ventas con ganancias"
```

---

### Task 5: Órdenes solo con compras

**Files:**
- Modify: `src/app/mis-ordenes/page.tsx` (completo)
- Modify: `src/app/_components/site-footer.tsx:42` (agregar Eventos)

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `EscrowTrack` (Task 3)

- [ ] **Step 1: Reescribir la página**

Reemplazar `src/app/mis-ordenes/page.tsx` completo:

```tsx
import { buyerNextStep, orderStatusLabel } from '@/lib/account/labels';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import type { OrderState } from '@/lib/orders/state-machine';
import { eventCoverImage } from '@/lib/ui/event-cover';
import EmptyState from '../_components/empty-state';
import EscrowTrack from '../_components/escrow-track';
import EventPoster from '../_components/event-poster';
import SectionShell from '../_components/section-shell';
import { requireUser } from '../session';
import UploadReceived from './upload-received';

export const metadata = { title: 'Mis órdenes' };
export const dynamic = 'force-dynamic';

const BUYER_TONE: Record<OrderState, string> = {
  creada: 'pastel tone-sun',
  transferencia_pendiente: 'pastel tone-sky',
  comprobante_en_revision: 'pastel tone-sky',
  entrada_recibida: 'pastel tone-sky',
  ingreso_confirmado: 'pastel tone-sky',
  disputada: 'pastel tone-sun',
  liberada: 'pastel tone-mint',
  liquidada: 'pastel tone-mint',
  reembolsada: 'is-closed',
  cancelada: 'is-closed',
};
const FINISHED: ReadonlySet<OrderState> = new Set<OrderState>(['liberada', 'liquidada', 'reembolsada', 'cancelada']);
const BUYER_STAGES = ['Retenido', 'Entrega', 'Cerrado'] as const;

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const user = await requireUser('/mis-ordenes');
  const [orders, q] = await Promise.all([buyerOrders(getDb(), user.userId), searchParams]);
  const steps = orders.map((o) =>
    buyerNextStep({ state: o.state, deliveryMode: o.deliveryMode, hasOpenDispute: o.hasOpenDispute, paymentMethod: o.paymentMethod }),
  );
  const active = orders.filter((o) => !FINISHED.has(o.state)).length;
  const needAction = steps.filter((s) => s.actions.length > 0).length;

  return (
    <SectionShell
      tone="ordenes"
      eyebrow="Tu cuenta"
      title="Mis órdenes"
      lead="Tus compras y en qué punto del escrow está cada una."
      aside={
        <ul className="section-stats">
          <li className="section-stat">
            <strong>{String(active).padStart(2, '0')}</strong>
            <span>En curso</span>
          </li>
          <li className="section-stat">
            <strong>{String(needAction).padStart(2, '0')}</strong>
            <span>Requieren acción</span>
          </li>
        </ul>
      }
    >
      {q.pago === 'ok' ? <p role="status" className="ok">¡Pago recibido! Queda retenido hasta después del evento.</p> : null}
      {q.pago === 'rechazado' ? <p role="alert" className="error">El pago fue rechazado. No se te cobró.</p> : null}

      <section className="section-panel" aria-labelledby="compras">
        <h2 id="compras" className="section-title">
          Mis compras <span className="count">{String(orders.length).padStart(2, '0')}</span>
        </h2>
        {orders.length === 0 ? (
          <EmptyState>
            <p>Todavía no has comprado entradas.</p>
            <p className="muted">Explora los próximos eventos con retención escrow en Panamá.</p>
            <a className="btn sm secondary" href="/eventos">Ver eventos</a>
          </EmptyState>
        ) : (
          <div className="orders-grid">
            {orders.map((o, i) => {
              const step = steps[i];
              return (
                <article key={o.orderId} className={`card order-card reveal reveal-${Math.min(i, 4)} ${BUYER_TONE[o.state]}`}>
                  <div className="order-top">
                    <div className="order-thumb">
                      <EventPoster seed={o.eventId} title={o.eventName} image={eventCoverImage(o.eventId, o.eventName)} size="thumb" sizes="56px" />
                    </div>
                    <div className="order-title-row">
                      <div>
                        <h3>{o.eventName}</h3>
                        <div className="muted money">
                          {formatPanamaDateTime(o.startsAt)} · {formatUsd(o.priceCents)}
                        </div>
                      </div>
                      <span className="chip">{orderStatusLabel(o.state)}</span>
                    </div>
                  </div>
                  <EscrowTrack state={o.state} labels={BUYER_STAGES} />
                  {o.state === 'transferencia_pendiente' && o.transferDeadline && !o.paymentMethod ? (
                    <p className="notice">El vendedor tiene hasta {formatPanamaDateTime(o.transferDeadline)} para transferirte la entrada.</p>
                  ) : null}
                  <p>{step.text}</p>
                  {step.actions.length > 0 ? (
                    <div className="actions">
                      {step.actions.includes('pay_manual') ? (
                        <a className="btn sm" href={`/pago-manual/${o.orderId}`}>
                          {o.state === 'comprobante_en_revision' ? 'Ver o reemplazar comprobante' : 'Pagar y subir comprobante'}
                        </a>
                      ) : null}
                      {step.actions.includes('view_ticket') ? (
                        <a className="btn sm" href={`/api/orders/${o.orderId}/ticket`} target="_blank" rel="noopener noreferrer">
                          Ver mi entrada
                        </a>
                      ) : null}
                      {step.actions.includes('confirm_entry') ? (
                        <a className="btn sm" href={`/ingreso/${o.orderId}`}>Confirmar ingreso</a>
                      ) : null}
                      {step.actions.includes('dispute') ? (
                        <a className="btn sm secondary" href={`/disputa/${o.orderId}`}>Reportar problema</a>
                      ) : null}
                    </div>
                  ) : null}
                  {step.actions.includes('upload_received') ? <UploadReceived orderId={o.orderId} /> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </SectionShell>
  );
}
```

Los bloques de acciones y de avisos son idénticos a los de antes. Solo cambian el marco, las cifras y el enlace del estado vacío.

- [ ] **Step 2: Footer**

En `src/app/_components/site-footer.tsx`, en la lista donde está la línea 42, agregar antes de esa línea:

```tsx
                <li><a href="/eventos">Eventos</a></li>
```

- [ ] **Step 3: CSS que quedó sin uso**

Run: `grep -rn "orders-overview\|orders-stat" src/app`
Si solo aparecen en `globals.css`, borrar esas reglas.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; solo los 4 fallos previos.

Navegador:
1. `/mis-ordenes`: cabecera rosa con "En curso" y "Requieren acción"; solo compras; los botones (pagar, ver entrada, confirmar ingreso, reportar) funcionan como antes.
2. `/mis-ordenes?pago=ok`: se ve el aviso.
3. Desde `/ingreso/<id>` y `/disputa/<id>`, "Órdenes" está activo en el menú.
4. Comparar las tres secciones en claro y oscuro: azul (Eventos), rosa (Órdenes), naranja (Vender).

- [ ] **Step 5: Commit**

```bash
git add src/app/mis-ordenes/page.tsx src/app/_components/site-footer.tsx src/app/globals.css
git commit -m "feat(ordenes): página propia solo de compras con resumen y acciones pendientes"
```

---

### Task 6: Verificación final y PR

- [ ] **Step 1: Suite completa y build**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: `tsc` limpio; vitest solo con los 4 fallos previos; build OK con las rutas nuevas `/eventos`, `/vender/publicaciones`, `/vender/ventas`.

- [ ] **Step 2: Recorrido completo en el navegador**

Como visitante, como usuario y como admin, en escritorio (1280 px) y móvil (390 px): `/` → Eventos → detalle → comprar; Órdenes; Vender y sus 3 pestañas; Admin. En cada página, la sección correcta tiene que estar activa en el header y en la barra inferior, y la pastilla del menú tiene que deslizarse entre secciones (view transition) cuando el sistema no pide movimiento reducido.

- [ ] **Step 3: PR al dueño del repo**

Crear el PR desde `ui/secciones` (y `ui/rediseno` si no se integró antes). En la descripción incluir:
- Las 3 secciones nuevas y qué se movió de `/mis-ordenes` a `/vender/*`.
- El commit `fix(auth)` del bucle de "Vender".
- Decisiones que necesitan su OK: el tema sigue al sistema (la bitácora dice "claro por defecto"); las fotos de portada son de stock (confirmar licencia) y las fotos reales siguen pendientes.
- Los 4 tests que ya fallaban en `700fa88`.
- Capturas de las tres secciones en claro y oscuro.

## Fuera de alcance (siguientes pasos)

- Home distinta con sesión ("Tu actividad" arriba).
- Badge de "requiere acción" en el menú (necesita una consulta por request en el header).
- Editar el precio de una publicación (requiere endpoint y regla de revisión).
- Filtros de la cartelera guardados en la URL además de `?q=` (fecha, precio, orden).
