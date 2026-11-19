# Bitácora de Reventa Segura

Registro vivo de lo que se ha hecho, por qué, y qué falta. Se actualiza con cada cambio. Para el detalle de cada
requisito, ver `docs/superpowers/specs/` (diseño y requisitos) y `docs/superpowers/plans/` (plan de construcción).
Guías operativas: `docs/supabase-setup.md` (base de datos y modo de prueba), `docs/launch-checklist.md` (lo que
falta antes de cobrar dinero real).

## 1. Qué es

Marketplace de reventa de entradas para Panamá. El comprador paga, el vendedor transfiere la entrada por la
boletera (Panatickets / Ticketplus) o la envía como imagen, y el dinero se libera al vendedor solo después de que el
comprador confirma su ingreso y pasa la ventana de disputas (12 h tras el inicio del evento). Si hay problema, el
comprador abre una disputa y, si procede, se le reembolsa. Los pagos corren en **modo de prueba** (pasarela falsa)
hasta que exista una pasarela real y visto bueno legal.

## 2. Línea de tiempo

| Etapa | Qué se hizo |
|---|---|
| Diseño | Lluvia de ideas, decisiones de producto (camino mixto de verificación, PWA primero), diseño y requisitos (RF/RNF/delimitantes/seguridad SEG-01..23), plan de 13 tareas. |
| Tareas 1–10 | Esquema y base de pruebas, precios, login por celular + 2FA de administrador, eventos/identidad/subidas, publicaciones con detección de duplicados (QR), máquina de estados + libro contable + compra, entrega (marca de agua vectorial), confirmación de ingreso/disputas/liberación, cancelación de eventos, pagos manuales a vendedores. Cada una con revisión independiente y correcciones. |
| Tarea 11 | Panel de administración (identidades, publicaciones, disputas, pagos, eventos) con 2FA y límite de intentos. |
| Tarea 12 | Interfaz móvil (PWA instalable), conexión real a base de datos, comandos de administración, verificación en navegador. |
| Tarea 13 | Endurecimiento: CSP con nonce, protección CSRF en todas las rutas, límites de intentos, restricciones de base de datos, repetición de TOTP, registros con redacción de datos personales, lista de pendientes antes de lanzar. Revisión multi-enfoque con escépticos. |
| Rediseño | v1 sobrio, v2 según imagen de referencia, v3 editorial (aprobado por el dueño y unido a `build/v1` el 2026-11-16). |
| Supabase | Proyecto `reventa-segura` creado por el dueño (región East US Ohio, API pública desactivada, RLS automático activado). Conexión TLS verificada con la CA raíz de Supabase. 12 tablas migradas. |
| Administrador | Entrada de administrador sin SMS solo desde la PC del dueño (llave local `TEST_MODE_ADMIN_KEY`, comando `npm run admin:code`), más 2FA (TOTP). |
| Seguridad (revisión T13) | Corregido el hallazgo crítico (páginas de admin saltables) y la rotación de TOTP que no cerraba sesiones. Pendientes importantes: ver sección 5. |

## 3. Decisiones importantes

- **Verificación sin alianzas con boleteras**: vía principal = transferencia dentro de la boletera; respaldo = imagen con marca de agua.
- **La plataforma no custodia dinero**: se cobra con pasarela licenciada y se paga al vendedor por transferencia manual detrás de un adaptador (`PayoutAdapter`).
- **Libro contable inmutable** (trigger de base de datos) y registro de auditoría inmutable; índices que impiden doble cobro/reembolso/disputa abierta.
- **Administradores**: rol + 2FA obligatorio; el segundo factor se registra solo por CLI (`npm run admin:create`), nunca por HTTP. Rotarlo cierra sus sesiones.
- **Seguridad de páginas de administración**: cada consulta exige administrador con 2FA; no basta el layout (Next puede renderizar una página sin su layout).
- **Base de datos**: Supabase por conexión servidor-a-Postgres (session pooler, TLS verificado). No se usa supabase-js ni sus claves. Desarrollo local sin `DATABASE_URL` usa PGlite.
- **Modo de prueba del código de ingreso** (no hay proveedor de SMS): `TEST_MODE_SHOW_LOGIN_CODE=1`. Nunca revela códigos de administrador salvo con la llave local y fuera de producción.
- **Diseño**: sin Tailwind (CSS con variables). Tema por defecto claro. Fotos de eventos: no hay campo de imagen; pósters generados (decisión de fotos reales pendiente del dueño).
- **Flujo de trabajo**: ramas `build/v1` (trabajo) y `main`; los subagentes trabajan en copias aisladas y el controlador revisa y une. Los cambios de diseño no se commitean sin aprobación del dueño.

## 4. Cómo se ejecuta

```
npm install
npm run dev            # servidor local (usa .env.local; sin DATABASE_URL usa una base local)
npm run db:migrate     # aplica migraciones a la base de DATABASE_URL
npm run db:check       # revisa conexión, tablas y RLS
npm run db:set-password# guarda la contraseña de la base (entrada oculta) en .env.local
npm run admin:create -- <celular>   # crea/promueve administrador y muestra su secreto TOTP una vez
npm run admin:code -- <celular>     # código de ingreso del administrador (solo PC del dueño)
npm run seed:dev       # eventos de demostración
npx vitest run --testTimeout=120000 --hookTimeout=120000   # pruebas (la suite completa tarda varios minutos)
```
Detalle y solución de problemas: `docs/supabase-setup.md`.

## 5. Pendientes

Importantes (revisión de seguridad T13), a cerrar antes de dinero real:
1. ~~Tope diario de SMS agotable por un atacante anónimo.~~ **Hecho** (ver registro). Queda como mejora: límite por IP más estricto para teléfonos sin cuenta.
2. ~~Bloqueo de vendedor con disputas perdidas: aplicar también al comprar y al aprobar publicaciones.~~ **Hecho** (ver registro).
3. ~~Limitador de intentos: no registrar cada rechazo; purga por lotes.~~ **Hecho** (ver registro).
~~4. Alertas sin id de orden/evento; falta lista de órdenes atascadas (`needsManualReview`).~~ **Hecho**.
~~5. `docs/launch-checklist.md` aún dice Neon en algunos puntos; faltan riesgos con dinero en la sección 7.~~ **Hecho**.
~~6. Pruebas de rutas solo recorren `src/app/api`; falta cubrir `route.tsx` y rutas fuera de `api`.~~ **Hecho**.
~~7. Falta probar por ruta HTTP el límite de 5 códigos por teléfono.~~ **Hecho**.
~~8. Consulta para localizar filas que bloqueen la migración 0004 en datos existentes.~~ **Hecho**.

Del dueño / externos: S.E. y cuenta comercial, abogado, pasarela de pago real, proveedor de SMS, términos y privacidad,
fotos de eventos (requiere campo de imagen + subida), fotos de eventos requieren campo de imagen + subida.

## 6. Registro de cambios recientes

(Cada entrada: fecha, qué, por qué.)

- 2026-11-15/16 — Supabase conectado; admin del dueño (66632666) creado; páginas de administración protegidas a nivel de datos; rotación TOTP cierra sesiones.
- 2026-11-16 — Bloqueo de vendedores (SEG-08) ahora también al comprar (la entrada ya verificada de un vendedor bloqueado aparece como no disponible, sin revelar el motivo) y al aprobar una publicación (rechazar sigue permitido). Por qué: antes un vendedor bloqueado podía seguir vendiendo hasta 10 entradas ya verificadas.
- 2026-11-16 — Limitador de intentos: solo se guardan los intentos permitidos (un atacante ya no puede llenar la tabla con rechazos) y el bloqueo termina cuando sale de la ventana el intento permitido más antiguo; la purga diaria borra por lotes de 1000. Por qué: cada rechazo era una fila nueva y un borrado único podía ser enorme.
- 2026-11-16 — Tope diario de SMS: los teléfonos sin cuenta pueden usar como máximo la mitad del tope (mínimo 1) en 24 h; la otra mitad queda para usuarios existentes. Por qué: un atacante anónimo con números inventados agotaba el tope y nadie podía entrar.
- 2026-11-16 — Alertas con id (orden/evento/ítem), lista `/admin/revision` de órdenes a revisar a mano, descubrimiento de rutas más estricto (cualquier `route.*` en `src/app`), prueba HTTP del límite de 5 códigos por teléfono, y `docs/launch-checklist.md` migrado de Neon a Supabase con los riesgos de dinero en la sección 7.
- 2026-11-16 — Rediseño v3 aprobado por el dueño y unido a `build/v1` (póster oscuro, entrada blanca con muescas, barra flotante, tema claro/oscuro). Pendiente: revisar admin/disputa/entrada/pago de prueba con el nuevo estilo, textos «pago protegido»/«te reembolsamos» (`src/lib/account/labels.ts`, `buy-button.tsx`) con el abogado, y fotos de eventos.
- 2026-11-18 — Media del hero "Cartel nocturno" (`public/media/home/hero.mp4`, 861 KB, 1280×720 H.264 sin audio, loop de 8 s; póster `public/media/home/hero.jpg`, 26 KB). Fuente: Mixkit #32590 («Woman recording a concert with her smartphone», `https://mixkit.co/free-stock-video/woman-recording-a-concert-with-her-smartphone-32590/`), licencia gratuita de Mixkit (sin atribución obligatoria). **Provisional**: reemplazar por clips propios grabados en eventos en Panamá cuando estén disponibles.
- 2026-11-19 — Plan maestro de salida a producción (legal, seguridad, SEO, UX) integrado sobre el rediseño «cartel nocturno» de `main`, en la rama `feat/plan-maestro-sobre-main` (**sin fusionar a `main`**). Qué: páginas `/privacidad`, `/terminos` (incluye el aviso legal), `/cookies` y `/reembolsos` (texto base con marcadores `[COMPLETAR_…]`, cifras tomadas de `pricing.ts` y de la ventana de 12 h; `LEGAL_REVIEWED` en `src/app/_pages/legal.tsx` apaga el aviso de revisión cuando el abogado las apruebe); aviso de cookies con aceptar/rechazar/configurar y analítica GA4 que solo se carga tras aceptar (`src/lib/consent`, `src/lib/analytics`, `cookie-consent.tsx`, `analytics.tsx`); datos del negocio, contacto, WhatsApp y redes desde variables de entorno (`src/lib/site/site-config.ts`, ninguna se inventa) en el pie de página y los textos legales; `robots.txt`, `sitemap.xml` (inicio, `/eventos`, `/como-funciona`, legales y cada evento), canonical, Open Graph, Twitter Cards, JSON-LD (Organization, WebSite, FAQPage, Event) y FAQ al final del inicio; favicon completo, `apple-touch-icon` e imagen social con la paleta nueva (`scripts/make-brand-assets.ts`); `X-Robots-Tag: noindex` en páginas privadas (`src/lib/seo/private-paths.ts`); redirección 301 de HTTP a HTTPS y de www a una sola versión del dominio (`src/lib/security/canonical.ts`, en `src/proxy.ts`); la CSP abre los destinos de GA4 solo si hay `ANALYTICS_GA4_ID`; honeypot en el ingreso y casilla de consentimiento (la de identidad también la exige `/api/identity`); `global-error.tsx`; caché de los archivos de `public/`; `overrides["@grpc/grpc-js"]` en `package.json` (`npm audit --omit=dev`: 4 avisos altos → 0). Se conservó el `loading.tsx` de `main`. Se corrigieron 2 pruebas de `proxy.test.ts` que esperaban `connect-src 'self'` sin los hosts de Firebase. Qué falta fuera del código: `docs/seo-y-lanzamiento.md`.
