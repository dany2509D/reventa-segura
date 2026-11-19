# Home "Cartel nocturno" — plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o superpowers:executing-plans, tarea por tarea. Los pasos usan checkboxes (`- [ ]`). Antes de cada tarea, leer `.superpowers/COORDINACION.md`.

**Objetivo:** reemplazar el hero y la sección de destacados de la home (`/`) por la dirección visual C: cartel tipográfico nocturno con video real de fondo, titulares que suben desde una máscara y una pared de carteles por evento.

**Arquitectura:** el hero pasa a ser un componente propio (`hero-cartel`) con su CSS aislado y un tema oscuro de alcance local (no toca el sistema claro/oscuro global). Los datos salen del `HomeData` que ya existe; se agrega `hero` al view-model. La lógica nueva (partir el titular, decidir si el video reproduce) vive en funciones puras con tests, porque vitest corre en `node` y solo toma `*.test.ts`. El video es un archivo local en `public/`, así que la CSP actual (`default-src 'self'`) lo permite sin cambios.

**Stack:** Next.js 16 (App Router, server components + un client component), React 19, CSS plano, vitest.

**Referencia visual:** canvas "Reventa Segura · direcciones visuales", tablero "C · Hero con video" (https://claude.ai/artifact/5YcgeGArSLtXWehPAxHdsR) y Figma `C · Cartel nocturno` (https://www.figma.com/design/iPA6Zk9nnztmm5HoYaKTWh).

## Restricciones globales

- Rama `ui/cartel`, creada desde `ui/secciones` (commit `e27845c`). Sin push ni PR hasta la Tarea 9.
- Commits solo con pathspec: `git commit -m "..." -- <archivos>`. Nunca `git add -A`. Sin trailers `Co-Authored-By` ni menciones a IA.
- `src/app/design-tokens.test.ts` prohíbe en TSX los atributos `style=` y las etiquetas `<style>`, y en CSS `@import` y `url(http…)`. También prohíbe `next/font/google` y `prefers-color-scheme`. Todo el estilo va en clases.
- El tema global sigue siendo claro por defecto con `[data-theme='dark']`. El hero es oscuro siempre, con variables propias dentro de `.hero-cartel`.
- Motion: entradas con `--ease-out`/`--ease-in-out` de `globals.css`, duraciones de 400 a 900 ms, escalonado de 50 a 80 ms. Nunca desde `scale(0)`. Con `prefers-reduced-motion: reduce` no hay movimiento y el video queda en su póster.
- Un video que se mueve más de 5 s necesita un botón para pausarlo (WCAG 2.2.2).
- Datos reales siempre: nombre, lugar, fecha, precio y cantidad salen de `HomeData`. Nada de "Lo más buscado" ni cifras inventadas.
- Video de fondo: ≤ 3 MB, 8 s en loop, sin audio, H.264, `+faststart`, con póster JPG.
- Textos en español de Panamá, tono cercano ("sin que te tumben"), sin la palabra "escrow" en la home.

## Reparto

| Agente | Tareas | Fuerte en |
|---|---|---|
| **Claude Code** | 0, 1, 2, 3, 4, 9 | Lógica, tests, componentes de datos, integración |
| **Gemini** | 5, 6, 7, 8 | Media, estilo visual, QA en navegador a varios anchos |

Orden: 0 → (1, 2, 5 en paralelo) → 3 → 4 → (6, 7 en paralelo) → 8 → 9. Gemini puede empezar 5 apenas exista la rama.

## Dueños de archivos

| Archivo | Dueño |
|---|---|
| `src/app/layout.tsx`, `src/app/fonts/**`, `src/app/design-tokens.test.ts` | Claude Code |
| `src/lib/ui/headline.ts`, `src/lib/ui/headline.test.ts`, `src/lib/ui/video-state.ts`, `src/lib/ui/video-state.test.ts` | Claude Code |
| `src/app/_home/view-model.ts`, `src/app/_home/view-model.test.ts` | Claude Code |
| `src/app/_home/hero-cartel.tsx`, `src/app/_home/hero-video.tsx`, `src/app/_home/hero-cartel.css`, `src/app/page.tsx` | Claude Code |
| `public/media/home/**`, `docs/bitacora.md` | Gemini |
| `src/app/_home/featured-events.tsx`, `src/app/_home/garantia.tsx`, `src/app/_home/home.css` | Gemini |

Si un agente necesita cambiar un archivo del otro, lo anota en "Pedidos" de `COORDINACION.md`.

---

### Tarea 0: Rama y coordinación (Claude Code)

**Archivos:**
- Modificar: `.superpowers/COORDINACION.md` (git-ignored)
- Crear: este plan

- [ ] **Paso 1: crear la rama**

```bash
cd ~/Desktop/reventa-segura-ui
git switch ui/secciones && git switch -c ui/cartel
```

- [ ] **Paso 2: reemplazar en `COORDINACION.md` las secciones "Rama y reglas", "Reparto" y "Dueño de archivos"** con la rama `ui/cartel`, la tabla de reparto y la de dueños de este plan. Agregar "Estado" con una línea por tarea (`- [ ] Tarea N — agente`) y dejar "Pedidos" y "Bugs" vacíos.

- [ ] **Paso 3: commit del plan**

```bash
git commit -m "docs: plan de la home cartel nocturno" -- docs/superpowers/plans/2026-11-18-home-cartel-nocturno.md
```

---

### Tarea 1: Fuente display Archivo Black (Claude Code)

**Archivos:**
- Crear: `src/app/fonts/ArchivoBlack-Regular.ttf`, `src/app/fonts/OFL.txt`
- Modificar: `src/app/layout.tsx`, `src/app/design-tokens.test.ts:292-297`

**Interfaces:**
- Produce: variable CSS `--font-display` en `<html>`, para todos los CSS de las tareas 4, 6 y 7.

- [ ] **Paso 1: cambiar el test de fuentes para que pida la fuente local**

En `src/app/design-tokens.test.ts`, reemplazar el `it('loads a single self-hosted font family…')` por:

```ts
  it('loads self-hosted fonts only: Geist Sans from the geist package and Archivo Black from a local file', () => {
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/from 'geist\/font\/sans'/);
    expect(layout).not.toMatch(/from 'geist\/font\/mono'/);
    expect(layout).toMatch(/from 'next\/font\/local'/);
    expect(layout).toMatch(/\.\/fonts\/ArchivoBlack-Regular\.ttf/);
    for (const f of [...tsx, ...walk(APP_DIR, '.ts')]) expect(readFileSync(f, 'utf8'), f).not.toMatch(/next\/font\/google/);
  });
```

- [ ] **Paso 2: correr el test y ver que falla**

Run: `npx vitest run src/app/design-tokens.test.ts -t "self-hosted fonts"`
Expected: FAIL en `toMatch(/from 'next\/font\/local'/)`.

- [ ] **Paso 3: bajar la fuente (licencia OFL)**

```bash
mkdir -p src/app/fonts
curl -fL -o src/app/fonts/ArchivoBlack-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf
curl -fL -o src/app/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/OFL.txt
```

- [ ] **Paso 4: cargarla en `layout.tsx`**

Agregar debajo del import de `GeistSans`:

```ts
import localFont from 'next/font/local';

// Display face for the home poster headlines. Self-hosted (no font CDN): the CSP allows font-src 'self' only.
const display = localFont({
  src: './fonts/ArchivoBlack-Regular.ttf',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-display',
  fallback: ['Arial Black', 'Impact', 'sans-serif'],
});
```

Cambiar el `<html>` y su comentario:

```tsx
    // data-theme is resolved before first paint by <ThemeScript /> matching the OS appearance
    // (suppressHydrationWarning covers that root attribute). Text: Geist Sans; poster headlines: Archivo Black.
    <html lang="es" className={`${GeistSans.variable} ${display.variable}`} suppressHydrationWarning>
```

- [ ] **Paso 5: correr el test y ver que pasa**

Run: `npx vitest run src/app/design-tokens.test.ts`
Expected: PASS (todos).

- [ ] **Paso 6: commit**

```bash
git commit -m "feat(ui): fuente display Archivo Black autohospedada" -- src/app/fonts/ArchivoBlack-Regular.ttf src/app/fonts/OFL.txt src/app/layout.tsx src/app/design-tokens.test.ts
```

---

### Tarea 2: Funciones puras del hero (Claude Code)

**Archivos:**
- Crear: `src/lib/ui/headline.ts`, `src/lib/ui/headline.test.ts`, `src/lib/ui/video-state.ts`, `src/lib/ui/video-state.test.ts`
- Modificar: `src/app/_home/view-model.ts`, `src/app/_home/view-model.test.ts`

**Interfaces:**
- Produce: `splitHeadline(name: string): [string, string]`; `shouldPlay(s: { reducedMotion: boolean; inView: boolean; userPaused: boolean }): boolean`; `HomeData.hero: EventView | null`.

- [ ] **Paso 1: tests que fallan**

`src/lib/ui/headline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitHeadline } from './headline';

describe('splitHeadline', () => {
  it.each([
    ['Panamá vs Jamaica · Amistoso', ['PANAMÁ VS', 'JAMAICA']],
    ['Concierto Urbano en Plaza Figali', ['CONCIERTO URBANO', 'EN PLAZA FIGALI']],
    ['Fin de Año Salsero', ['FIN DE AÑO', 'SALSERO']],
    ['Gala Navideña · Orquesta Sinfónica Nacional', ['GALA', 'NAVIDEÑA']],
    ['Festival', ['FESTIVAL', '']],
    ['   ', ['', '']],
  ])('%s', (name, expected) => {
    expect(splitHeadline(name)).toEqual(expected);
  });
});
```

`src/lib/ui/video-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldPlay } from './video-state';

describe('shouldPlay', () => {
  it('plays only when motion is allowed, the video is on screen and the person did not pause it', () => {
    expect(shouldPlay({ reducedMotion: false, inView: true, userPaused: false })).toBe(true);
    expect(shouldPlay({ reducedMotion: true, inView: true, userPaused: false })).toBe(false);
    expect(shouldPlay({ reducedMotion: false, inView: false, userPaused: false })).toBe(false);
    expect(shouldPlay({ reducedMotion: false, inView: true, userPaused: true })).toBe(false);
  });
});
```

En `src/app/_home/view-model.test.ts`, agregar dentro del `describe` de `buildHomeData` (o al final del archivo, con los imports que ya usa):

```ts
it('picks the first featured event as the hero, and null when there are no events', () => {
  expect(buildHomeData([]).hero).toBeNull();
  const rows = [
    { id: 'a', name: 'Sin entradas', venue: 'V', startsAt: new Date('2026-12-01T00:00:00Z'), resaleProhibited: false, fromCents: null, listingCount: 0 },
    { id: 'b', name: 'Con entradas', venue: 'V', startsAt: new Date('2026-12-02T00:00:00Z'), resaleProhibited: false, fromCents: 2500, listingCount: 3 },
  ];
  expect(buildHomeData(rows).hero?.id).toBe('b');
});
```

- [ ] **Paso 2: correr y ver que fallan**

Run: `npx vitest run src/lib/ui/headline.test.ts src/lib/ui/video-state.test.ts src/app/_home/view-model.test.ts`
Expected: FAIL (módulos inexistentes y `hero` undefined).

- [ ] **Paso 3: implementar**

`src/lib/ui/headline.ts`:

```ts
/**
 * Splits an event name into the two lines of the home poster headline: the subtitle after " · " is
 * dropped, and the break goes where the longer line is as short as possible. toUpperCase (not the
 * locale-aware variant) gives the same text on the server and in every browser.
 */
export function splitHeadline(name: string): [string, string] {
  const main = name.normalize('NFC').split(' · ')[0].trim();
  const words = main.split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
  if (words.length <= 1) return [words[0] ?? '', ''];
  let best = 1;
  let bestLongest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const longest = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (longest < bestLongest) {
      bestLongest = longest;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
```

`src/lib/ui/video-state.ts`:

```ts
export type VideoState = { reducedMotion: boolean; inView: boolean; userPaused: boolean };

/** The hero video plays only when motion is allowed, it is on screen and nobody paused it. */
export function shouldPlay(s: VideoState): boolean {
  return !s.reducedMotion && s.inView && !s.userPaused;
}
```

En `src/app/_home/view-model.ts`, agregar a `HomeData`:

```ts
  /** The event the hero poster shows: the first featured one (on sale when any is). */
  hero: EventView | null;
```

y en el `return` de `buildHomeData`:

```ts
    hero: featured[0] ?? null,
```

- [ ] **Paso 4: correr y ver que pasan**

Run: `npx vitest run src/lib/ui/headline.test.ts src/lib/ui/video-state.test.ts src/app/_home/view-model.test.ts`
Expected: PASS.

- [ ] **Paso 5: commit**

```bash
git commit -m "feat(home): titular partido en dos líneas, estado del video y evento del hero" -- src/lib/ui/headline.ts src/lib/ui/headline.test.ts src/lib/ui/video-state.ts src/lib/ui/video-state.test.ts src/app/_home/view-model.ts src/app/_home/view-model.test.ts
```

---

### Tarea 3: Video de fondo con pausa (Claude Code)

**Archivos:**
- Crear: `src/app/_home/hero-video.tsx`

**Interfaces:**
- Consume: `shouldPlay` (Tarea 2); archivos `/media/home/hero.mp4` y `/media/home/hero.jpg` (Tarea 5).
- Produce: `<HeroVideo src poster />`, con las clases `.hero-cartel-video` y `.hero-cartel-pause` que estiliza la Tarea 4.

- [ ] **Paso 1: escribir el componente**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { shouldPlay } from '@/lib/ui/video-state';

/**
 * Decorative background loop of the home poster. Starts paused on its poster frame and plays only
 * when motion is allowed and it is on screen; the button lets anyone stop it (WCAG 2.2.2).
 */
export default function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    const el = ref.current;
    const io = el ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 }) : null;
    if (el && io) io.observe(el);
    return () => {
      mq.removeEventListener('change', update);
      io?.disconnect();
    };
  }, []);

  const playing = shouldPlay({ reducedMotion, inView, userPaused });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  return (
    <>
      <video ref={ref} className="hero-cartel-video" src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" />
      {reducedMotion ? null : (
        <button type="button" className="hero-cartel-pause" aria-pressed={userPaused} onClick={() => setUserPaused((p) => !p)}>
          {userPaused ? 'Reproducir video' : 'Pausar video'}
        </button>
      )}
    </>
  );
}
```

- [ ] **Paso 2: verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 3: commit**

```bash
git commit -m "feat(home): video de fondo del hero con pausa y movimiento reducido" -- src/app/_home/hero-video.tsx
```

---

### Tarea 4: Hero cartel y armado de la home (Claude Code)

**Archivos:**
- Crear: `src/app/_home/hero-cartel.tsx`, `src/app/_home/hero-cartel.css`
- Modificar: `src/app/page.tsx` (bloque `<section className="hero container">` completo)

**Interfaces:**
- Consume: `splitHeadline`, `HomeData.hero`, `ticketCountLabel`, `HeroVideo`, `--font-display`.
- Produce: `<HeroCartel data={Promise<HomeData>} />`. La Tarea 6 coloca la pared de carteles justo debajo y la Tarea 7 la franja de garantía.

- [ ] **Paso 1: componente**

`src/app/_home/hero-cartel.tsx`:

```tsx
import { Suspense, type ReactNode } from 'react';
import { splitHeadline } from '@/lib/ui/headline';
import HeroVideo from './hero-video';
import { ticketCountLabel, type HomeData } from './view-model';
import './hero-cartel.css';

/** Home poster: real background loop, the featured event's name set huge, and its cheapest price. */
export default function HeroCartel({ data }: { data: Promise<HomeData> }) {
  return (
    <section className="hero-cartel" aria-labelledby="hero-cartel-title">
      <HeroVideo src="/media/home/hero.mp4" poster="/media/home/hero.jpg" />
      <div className="hero-cartel-shade" aria-hidden="true" />
      <div className="hero-cartel-inner container">
        <Suspense fallback={<HeroCopy lines={['CARTELERA', 'DE REVENTA']} />}>
          <HeroContent data={data} />
        </Suspense>
      </div>
    </section>
  );
}

async function HeroContent({ data }: { data: Promise<HomeData> }) {
  const { hero } = await data;
  if (!hero) {
    return (
      <HeroCopy lines={['CARTELERA', 'DE REVENTA']}>
        <p className="hero-cartel-note">Cuando el equipo publique un evento, lo verás aquí.</p>
        <a className="hero-cartel-cta" href="/vender">Vender una entrada</a>
      </HeroCopy>
    );
  }
  const onSale = hero.count > 0 && hero.from !== null;
  return (
    <HeroCopy lines={splitHeadline(hero.name)} fullName={hero.name} eyebrow={`${hero.dateShort} · ${hero.venue}`} dateTime={hero.date.iso}>
      {onSale ? (
        <>
          <p className="hero-cartel-count">{ticketCountLabel(hero.count)} desde</p>
          <p className="hero-cartel-price">{hero.from}</p>
          <p className="hero-cartel-note">Pagas aquí y el vendedor cobra cuando ya entraste.</p>
          <a className="hero-cartel-cta" href={`/eventos/${hero.id}`}>Ver entradas</a>
        </>
      ) : (
        <>
          <p className="hero-cartel-note">Todavía no hay entradas a la venta para este evento.</p>
          <a className="hero-cartel-cta" href="/eventos">Ver la cartelera</a>
        </>
      )}
    </HeroCopy>
  );
}

function HeroCopy({
  lines,
  fullName,
  eyebrow,
  dateTime,
  children,
}: {
  lines: [string, string];
  fullName?: string;
  eyebrow?: string;
  dateTime?: string;
  children?: ReactNode;
}) {
  return (
    <div className="hero-cartel-grid">
      <div className="hero-cartel-head">
        {eyebrow ? (
          <p className="hero-cartel-eyebrow">
            <time dateTime={dateTime}>{eyebrow}</time>
          </p>
        ) : null}
        <h1 id="hero-cartel-title" className="hero-cartel-title">
          {fullName ? <span className="visually-hidden">{fullName}</span> : null}
          <span className="hero-cartel-mask" aria-hidden={fullName ? 'true' : undefined}>
            <span className="hero-cartel-line">{lines[0]}</span>
          </span>
          {lines[1] ? (
            <span className="hero-cartel-mask" aria-hidden={fullName ? 'true' : undefined}>
              <span className="hero-cartel-line is-accent">{lines[1]}</span>
            </span>
          ) : null}
        </h1>
      </div>
      {children ? <div className="hero-cartel-side">{children}</div> : null}
    </div>
  );
}
```

- [ ] **Paso 2: CSS**

`src/app/_home/hero-cartel.css`:

```css
/* Home poster (direction C). Always dark, whatever the site theme: its own scoped colours. */
.hero-cartel {
  --hc-bg: #0e0e0e;
  --hc-ink: #f2ede4;
  --hc-muted: #c9c3b8;
  --hc-accent: #ff5a1f;
  --hc-accent-hover: #ff7340;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: min(92svh, 900px);
  display: flex;
  background: var(--hc-bg);
  color: var(--hc-ink);
}
.hero-cartel-video { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; opacity: 0.5; }
.hero-cartel-shade {
  position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(90deg, rgb(14 14 14 / 0.92) 0%, rgb(14 14 14 / 0.55) 55%, rgb(14 14 14 / 0.2) 100%);
}
.hero-cartel-inner { display: flex; flex-direction: column; justify-content: flex-end; width: 100%; padding-block: var(--space-16) var(--space-12); }
.hero-cartel-grid { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-8); }
.hero-cartel-head { flex: 999 1 36rem; min-width: 0; }
.hero-cartel-side { flex: 1 1 15rem; max-width: 18rem; display: flex; flex-direction: column; gap: var(--space-4); }
.hero-cartel-eyebrow { margin: 0 0 var(--space-3); color: var(--hc-accent); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.hero-cartel-title { margin: 0; font-family: var(--font-display), sans-serif; font-weight: 400; font-size: clamp(3.5rem, 10.5vw, 9.5rem); line-height: 0.88; letter-spacing: -0.04em; }
.hero-cartel-mask { display: block; overflow: hidden; padding-bottom: 0.04em; }
.hero-cartel-line { display: block; transform: translateY(105%); animation: hc-rise var(--dur-complex) var(--ease-in-out) forwards; }
.hero-cartel-mask + .hero-cartel-mask .hero-cartel-line { animation-delay: 120ms; }
.hero-cartel-line.is-accent { color: var(--hc-accent); }
.hero-cartel-side > * { opacity: 0; transform: translateY(10px); animation: hc-in var(--dur-enter) var(--ease-out) forwards; }
.hero-cartel-side > :nth-child(1) { animation-delay: 700ms; }
.hero-cartel-side > :nth-child(2) { animation-delay: 760ms; }
.hero-cartel-side > :nth-child(3) { animation-delay: 820ms; }
.hero-cartel-side > :nth-child(4) { animation-delay: 880ms; }
.hero-cartel-count, .hero-cartel-note { margin: 0; color: var(--hc-muted); }
.hero-cartel-note { color: var(--hc-ink); line-height: 1.5; }
.hero-cartel-price { margin: 0; font-family: var(--font-display), sans-serif; font-size: clamp(3rem, 6vw, 4.5rem); line-height: 0.9; }
.hero-cartel-cta {
  align-self: flex-start; display: inline-flex; align-items: center; min-height: 52px; padding: 0 var(--space-6);
  background: var(--hc-accent); color: var(--hc-bg); text-decoration: none;
  font-family: var(--font-display), sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
  transition: transform var(--dur-micro) var(--ease-out), background-color var(--dur-micro) ease;
}
.hero-cartel-cta:active { transform: scale(0.97); }
.hero-cartel-cta:focus-visible { outline: 3px solid var(--hc-ink); outline-offset: 3px; }
.hero-cartel-pause {
  position: absolute; right: var(--gutter); bottom: var(--space-4); min-height: 44px; padding: 0 var(--space-4);
  border: 1px solid rgb(242 237 228 / 0.4); background: rgb(14 14 14 / 0.6); color: var(--hc-ink); font: inherit; cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .hero-cartel-cta:hover { background: var(--hc-accent-hover); }
}
@keyframes hc-rise { to { transform: translateY(0); } }
@keyframes hc-in { to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .hero-cartel-line, .hero-cartel-side > * { animation: none; opacity: 1; transform: none; }
}
```

Nota: `.hero-cartel-pause` queda abajo a la derecha, y el contenido tiene `padding-block-end` suficiente para que no lo tape. Si en 390 px choca con el botón, Gemini lo reporta en la Tarea 8.

- [ ] **Paso 3: usarlo en `page.tsx`**

Reemplazar todo el `<section className="hero container" …>…</section>` por:

```tsx
        <HeroCartel data={data} />
        <div className="hero-search-band container">
          <Suspense fallback={<SearchSkeleton />}>
            <HeroSearch data={data} mode="navigate" />
          </Suspense>
        </div>
```

Imports: agregar `import HeroCartel from './_home/hero-cartel';`. Quitar `IconArrowRight`, `Magnetic`, `HeroStats` y `StatsSkeleton` si quedan sin uso. Actualizar el comentario de `Home()` para que diga que la home abre con el cartel del evento destacado.

- [ ] **Paso 4: verificar**

Run: `npx tsc --noEmit && npx vitest run src/app src/lib/ui`
Expected: sin errores; los 5 fallos conocidos de auth/CSP no están en esas carpetas.

- [ ] **Paso 5: commit**

```bash
git commit -m "feat(home): hero cartel nocturno con video y titular del evento destacado" -- src/app/_home/hero-cartel.tsx src/app/_home/hero-cartel.css src/app/page.tsx
```

---

### Tarea 5: Media del hero (Gemini)

**Archivos:**
- Crear: `public/media/home/hero.mp4`, `public/media/home/hero.jpg`
- Modificar: `docs/bitacora.md`

- [ ] **Paso 1: copiar el loop ya preparado**

Origen: `~/Desktop/reventa-segura-motion/clips/c-celular.mp4` y `c-celular.jpg` (Mixkit #32590, "Woman recording a concert with her smartphone", licencia Mixkit gratuita, sin atribución obligatoria).

```bash
mkdir -p public/media/home
cp ~/Desktop/reventa-segura-motion/clips/c-celular.mp4 public/media/home/hero.mp4
cp ~/Desktop/reventa-segura-motion/clips/c-celular.jpg public/media/home/hero.jpg
```

- [ ] **Paso 2: comprobar peso y formato**

```bash
ls -la public/media/home
ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration -of compact public/media/home/hero.mp4
```

Expected: `hero.mp4` ≤ 3 MB, `h264`, 1280x720, ~8 s, sin pista de audio; `hero.jpg` ≤ 200 KB.

- [ ] **Paso 3: anotar el origen en `docs/bitacora.md`**, en una entrada con fecha: archivo, fuente (URL de Mixkit), licencia y que es provisional hasta tener clips propios de eventos en Panamá.

- [ ] **Paso 4: commit**

```bash
git commit -m "feat(home): loop de video y póster del hero" -- public/media/home/hero.mp4 public/media/home/hero.jpg docs/bitacora.md
```

---

### Tarea 6: Pared de carteles "Esta temporada" (Gemini)

**Archivos:**
- Modificar: `src/app/_home/featured-events.tsx`, `src/app/_home/home.css` (reglas `.feature-*`)

**Interfaces:**
- Consume: `HomeData.featured` (no cambia), `--font-display`, `EventPoster` sin `image` (genera el cartel tipográfico de `poster.css`; no tocar `poster.css`, es del sistema de pósters).

Especificación (tablero C de Figma, sección "Esta temporada"):
- Título de sección `ESTA TEMPORADA` en `--font-display`, a la izquierda; enlace `Ver los N eventos →` a la derecha (N = `events.length`, solo si hay más que los destacados).
- Hasta 3 tarjetas en fila desde 1024 px (una columna en 390 px), con proporción 3:4, fondo de color plano y sin foto.
- Cada tarjeta muestra arriba, en mayúsculas pequeñas, el tipo y el lugar (`event.venue`); en el centro, `splitHeadline(event.name)` en `--font-display` a 52 px, máx. 3 líneas; abajo a la izquierda `event.dateShort`; abajo a la derecha `event.from` en `--font-display` a 44 px, o "Sin entradas".
- Colores de fondo en ciclo: `#B3122E`, `#F2EDE4` (con texto `#0E0E0E`), `#1F3BD6`. El texto sobre los otros dos es `#F2EDE4`. Verificar contraste ≥ 4.5:1 para el texto chico.
- Toda la tarjeta es un `<a href="/eventos/{id}">`. Hover solo con `@media (hover: hover) and (pointer: fine)`: `translateY(-2px)` en 160 ms con `var(--ease-out)`. `:active` con `scale(0.98)`.
- Entrada: usar la clase `reveal` existente con `reveal-0/1/2` (ya escalona); no agregar observers nuevos.
- Sin `style=` en TSX (lo prohíbe el test de tokens).

- [ ] **Paso 1: cambiar el markup de `FeaturedEvents` y `FeatureCard`** según la especificación, importando `splitHeadline` de `@/lib/ui/headline`.
- [ ] **Paso 2: reemplazar las reglas `.feature-*` de `home.css`** y borrar las del hero viejo (`.hero`, `.hero-top`, `.hero-copy`, `.hero-side`, `.hero-title`, `.hero-sub`, `.hero-actions`, `.hero-how`, `.hero-metric*`, `.hero-stats`, `.line`, `.line-in*`, `.hero-in*`), salvo `.hero-search*`, que sigue en uso.
- [ ] **Paso 3:** `npx tsc --noEmit && npx vitest run src/app/design-tokens.test.ts src/app/_home` → sin errores.
- [ ] **Paso 4: commit**

```bash
git commit -m "feat(home): pared de carteles por evento" -- src/app/_home/featured-events.tsx src/app/_home/home.css
```

---

### Tarea 7: Franja "¿Y si me tumban?" (Gemini)

**Archivos:**
- Crear: `src/app/_home/garantia.tsx`
- Modificar: `src/app/_home/home.css`; pedir en COORDINACION a Claude Code que lo monte en `page.tsx` después de `<FeaturedEvents />` (o montarlo y avisarlo, si Claude Code ya cerró la Tarea 4).

Especificación:
- Banda a todo el ancho del contenedor, fondo `#F2EDE4`, texto `#0E0E0E`, padding 36 px / 40 px, en fila desde 768 px y en columna debajo.
- Título `¿Y SI ME TUMBAN?` en `--font-display`, 40 px.
- Texto exacto: "No le pagas al vendedor. Guardamos tu plata hasta que entras, y si en la puerta te dicen que no, abres un reporte y lo revisamos." Seguido de `<a href="/como-funciona">Cómo funciona</a>`.
- Entra con la clase `reveal` existente.

- [ ] **Paso 1: componente y estilos.**
- [ ] **Paso 2:** `npx tsc --noEmit && npx vitest run src/app/design-tokens.test.ts`.
- [ ] **Paso 3: commit**

```bash
git commit -m "feat(home): franja de garantía en la home" -- src/app/_home/garantia.tsx src/app/_home/home.css
```

---

### Tarea 8: QA visual (Gemini)

Con el servidor de desarrollo en `http://localhost:3100/` (con `FAKE_GATEWAY_SECRET` en `.env.local`), revisar `/` en:

- 1440x900, 1024x768, 390x844 y 320 de ancho.
- Tema claro y oscuro (el hero debe verse igual en los dos).
- `prefers-reduced-motion: reduce` (DevTools › Rendering): sin movimiento, video quieto en el póster, sin botón de pausa.
- Sin eventos (base vacía): titular "CARTELERA / DE REVENTA" y botón a `/vender`.
- Lighthouse móvil: LCP < 2.5 s, CLS < 0.1, sin errores de CSP en la consola.

Revisar en particular:
- Titular: nada se corta en 320 px y las letras no tocan el botón de pausa.
- La línea naranja no se confunde con un enlace.
- Foco visible en "Ver entradas" y en "Pausar video".
- El texto chico de los carteles cumple el contraste.

- [ ] **Paso 1:** reportar cada problema en "Bugs" de `COORDINACION.md` con el formato de ese archivo (ruta · ancho/tema · qué pasa · qué se esperaba · dueño del archivo).
- [ ] **Paso 2:** arreglar los de sus archivos y commitear con pathspec; los de Claude Code van a "Pedidos".

---

### Tarea 9: Cierre (Claude Code)

- [ ] **Paso 1:** resolver los pedidos y bugs de la Tarea 8 en los archivos propios.
- [ ] **Paso 2:** correr todo:

```bash
npx tsc --noEmit
npx vitest run
npx next build
npm run check:headers
```

Expected: `tsc` limpio; vitest sin fallos nuevos (los 5 conocidos de auth/CSP siguen igual); build OK; headers OK.

- [ ] **Paso 3:** borrar duplicados de iCloud (`* 2.ts`, `* 2.tsx`) si aparecieron, sin commitearlos.
- [ ] **Paso 4:** marcar el estado final en `COORDINACION.md` y preparar la descripción del PR con:
  - Por qué cambió la home: dirección C elegida.
  - Origen y licencia del video.
  - La fuente nueva y el cambio en el test de fuentes.
  - Que el hero ignora el tema a propósito.
  - Capturas en 1440 y 390.
