# Reventa Segura

Marketplace de reventa de entradas para Panamá, con vendedores verificados y **pago protegido**: el dinero no llega al vendedor hasta que cierra el plazo de reportes, 12 horas después del inicio del evento.

> **Estado:** la v1 está completa y endurecida, pero funciona **solo en modo de prueba** (pasarela de pago falsa y códigos de ingreso de prueba), desplegada en <https://reventa-segura.vercel.app>. No se cobra dinero real hasta cerrar [`docs/launch-checklist.md`](docs/launch-checklist.md).

## Cómo funciona una venta

1. **Antes de vender.** El vendedor verifica su celular y su identidad (cédula o pasaporte y una selfie). El equipo revisa la identidad y cada publicación antes de mostrarla.
2. **Compra.** El comprador paga dentro de la plataforma (tarjeta, Yappy o ACH). El dinero queda retenido; un pago pendiente se cancela a los 15 minutos.
3. **Entrega.** El vendedor transfiere la entrada por la boletera (Panatickets, Ticketplus u otra) o la envía como imagen con marca de agua. El comprador confirma que la recibió.
4. **Ingreso y cobro.** El día del evento el comprador confirma su ingreso. El pago se libera al vendedor cuando cierra el plazo de reportes (12 h después del inicio).
5. **Si algo sale mal.** El comprador abre una disputa desde «Mis órdenes» dentro de ese plazo y el equipo decide: reembolso al comprador o liberación al vendedor.

Reglas vigentes (en [`src/lib/pricing/pricing.ts`](src/lib/pricing/pricing.ts)): comisión del 10 %, que se descuenta al vendedor y no se suma al comprador, y precio máximo del 150 % del valor original de la entrada.

## Tecnología

| Capa | Qué se usa |
|---|---|
| App | [Next.js](https://nextjs.org) 16 (App Router, Turbopack, `src/proxy.ts`), React 19, TypeScript |
| Estilos | CSS propio con variables de diseño (tema claro y oscuro), sin Tailwind; fuentes alojadas en el propio sitio, sin CDN |
| Datos | PostgreSQL con [Drizzle ORM](https://orm.drizzle.team): Supabase en producción y [PGlite](https://pglite.dev) local en desarrollo |
| Archivos privados | Vercel Blob (en desarrollo, en memoria), URL firmadas de 60 s |
| Ingreso | Código por mensaje de texto con Firebase Phone Auth y reCAPTCHA; 2FA (TOTP) para administradores |
| Entradas | `sharp` (reprocesado y marca de agua) y `jsqr` (detección de entradas duplicadas por QR) |
| Validación y pruebas | `zod`, Vitest |
| Despliegue | Vercel, con un cron diario de mantenimiento |

## Empezar

Requisitos: Node.js (se desarrolla con la versión 24) y npm.

```powershell
npm install
npm run dev
```

Abre <http://localhost:3000>. Sin `DATABASE_URL`, la app usa una base local en `.data/pglite` que se crea y migra sola; no hace falta configurar nada más.

Para tener datos de demostración (eventos y entradas verificadas de Panamá):

```powershell
npm run seed:dev
```

> `seed:dev` escribe en la base que indique `DATABASE_URL`: si tu `.env.local` apunta a Supabase, siembra ahí. Imprime el destino antes de escribir y se niega a correr en producción.

### Variables de entorno

Copia [`.env.example`](.env.example) a `.env.local` si necesitas cambiar algo (nunca se sube a git). Cada variable está explicada en ese archivo. En producción, un servidor sin `DATABASE_URL`, `FILE_URL_SECRET`, `CRON_SECRET` o `BLOB_READ_WRITE_TOKEN` se niega a arrancar. Los datos públicos del negocio (`SITE_URL`, razón social, RUC, contacto, redes, analítica) son opcionales y se explican en [`docs/seo-y-lanzamiento.md`](docs/seo-y-lanzamiento.md).

### Iniciar sesión en desarrollo

No hay proveedor de SMS real todavía. Con `ALLOW_FAKE_SMS=true` y `NEXT_PUBLIC_ALLOW_FAKE_SMS=true` no se envía nada y el código `123456` es válido; con `TEST_MODE_SHOW_LOGIN_CODE=1` el código se muestra en pantalla. Ambos modos se ignoran en producción.

Para crear un administrador, que además necesita 2FA:

```powershell
npm run admin:create -- +50761234567
npm run admin:code -- +50761234567
```

El primero muestra el secreto TOTP una sola vez (volver a ejecutarlo lo rota). El segundo da el código de ingreso del administrador y solo funciona desde tu computadora, con la llave local `TEST_MODE_ADMIN_KEY` (`npm run admin:code -- --init` la crea).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm test` | Todas las pruebas (Vitest) |
| `npm run db:generate` | Genera una migración a partir de `src/lib/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones a la base de `DATABASE_URL` (en producción es un paso explícito del despliegue) |
| `npm run db:check` | Revisa conexión, tablas y seguridad de la base |
| `npm run db:set-password` | Guarda la contraseña de la base en `.env.local` con entrada oculta |
| `npm run seed:dev` | Datos de demostración |
| `npm run admin:create` / `npm run admin:code` | Administradores (ver arriba) |
| `npm run check:headers -- <url>` | Comprueba las cabeceras de seguridad y la CSP de un servidor en marcha |

El proyecto no tiene linter; la comprobación de tipos es `npx tsc --noEmit`.

## Pruebas

```powershell
$env:ALLOW_FAKE_SMS = 'true'
npx vitest run --testTimeout=120000 --hookTimeout=120000
```

La suite completa tarda varios minutos (cada archivo levanta su propia base PGlite). Sin `ALLOW_FAKE_SMS=true`, dos pruebas del ingreso fallan con 503. Si en Windows aparecen errores de arranque de workers (`spawn UNKNOWN`), añade `--maxWorkers=4`.

Hay pruebas de las reglas de negocio, de cada ruta de la API (quién puede llamarla, CSRF, límites de tasa) y del diseño (contraste de color, CSP y marcado).

## Estructura

```
src/
  app/          Páginas y rutas de la API (App Router)
  lib/          Lógica de negocio, una carpeta por dominio
  proxy.ts      CSP con nonce y cabeceras de seguridad en cada respuesta
drizzle/        Migraciones SQL
scripts/        Comandos de administración, siembra y herramientas
docs/           Diseño, bitácora, guías y listas de lanzamiento
public/         Iconos, imagen para compartir, service worker y página sin conexión
```

Dentro de `src/lib/`: `auth` (códigos, sesiones, TOTP), `orders` (máquina de estados y libro contable), `payments` (adaptador de la pasarela), `tickets` (publicaciones, QR y marca de agua), `identity`, `disputes`, `entry` (confirmación de ingreso), `events`, `payouts`, `jobs` (cron de mantenimiento), `security` (cabeceras, límites de tasa), `db`, `uploads`, `observability`, `config`, `pricing` y `ui`.

## Seguridad

- **Navegador:** CSP con nonce por respuesta, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `frame-ancestors 'none'`; todo se prueba con `npm run check:headers`.
- **API:** protección CSRF, límites de tasa, y una prueba que recorre cada ruta como anónimo, otro usuario, la contraparte, administrador sin 2FA y administrador; una ruta nueva sin clasificar hace fallar la prueba.
- **Datos:** el libro contable y la auditoría son solo de añadir (la base rechaza modificarlos o borrarlos); un cobro y un reembolso como máximo por orden; consultas parametrizadas con Drizzle.
- **Archivos privados:** documentos de identidad y entradas en almacenamiento privado, reprocesados sin metadatos y servidos con enlaces firmados de 60 s.
- **Secretos:** nada privado llega al navegador. La base de datos se usa solo desde el servidor, con TLS verificado, y no se usan las claves públicas ni `service_role` de Supabase.

El detalle, con los riesgos que se aceptaron a sabiendas, está en [`docs/launch-checklist.md`](docs/launch-checklist.md).

## Despliegue

1. Crear la base y conectarla: [`docs/supabase-setup.md`](docs/supabase-setup.md).
2. Definir las variables en Vercel, una por entorno (Preview y Production nunca comparten secretos).
3. Ejecutar `npm run db:migrate`.
4. Vercel ejecuta `/api/cron/maintenance` cada día (configurado en [`vercel.ts`](vercel.ts)): cancela pagos sin completar, libera órdenes al cerrar el plazo y borra documentos de identidad vencidos.
5. Comprobar con `npm run check:headers -- https://tu-dominio`.

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`docs/bitacora.md`](docs/bitacora.md) | Qué se hizo, por qué, decisiones y pendientes; se actualiza con cada cambio |
| [`docs/launch-checklist.md`](docs/launch-checklist.md) | Todo lo que falta antes de cobrar dinero real, con responsable |
| [`docs/seo-y-lanzamiento.md`](docs/seo-y-lanzamiento.md) | Variables públicas, dominio, buscadores, analítica y textos legales |
| [`docs/supabase-setup.md`](docs/supabase-setup.md) | Base de datos en Supabase, paso a paso |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Diseño y requisitos del producto |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Planes de construcción |

## Problemas frecuentes

- **`EPERM` al hacer `npm run build` dentro de OneDrive.** OneDrive puede convertir `.next/static/<id>` en archivos en la nube que Node no puede borrar. Borra solo esa carpeta (es salida regenerable) y vuelve a compilar.
- **«Another next dev server is already running».** Ya hay un servidor de desarrollo en esta carpeta; abre su puerto en lugar de iniciar otro.
- **`next dev` crea `AGENTS.md`.** Next 16 lo genera solo; no forma parte del trabajo.
