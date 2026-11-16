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
| Rediseño | v1 sobrio, v2 según imagen de referencia, v3 editorial con movimiento (en curso, sin commits hasta aprobación del dueño). |
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
1. Tope diario de SMS y presupuesto por teléfono agotables por un atacante anónimo.
2. ~~Bloqueo de vendedor con disputas perdidas: aplicar también al comprar y al aprobar publicaciones.~~ **Hecho** (ver registro).
3. ~~Limitador de intentos: no registrar cada rechazo; purga por lotes.~~ **Hecho** (ver registro).
4. Alertas sin id de orden/evento; falta lista de órdenes atascadas (`needsManualReview`).
5. `docs/launch-checklist.md` aún dice Neon en algunos puntos; faltan riesgos con dinero en la sección 7.
6. Pruebas de rutas solo recorren `src/app/api`; falta cubrir `route.tsx` y rutas fuera de `api`.
7. Falta probar por ruta HTTP el límite de 5 códigos por teléfono.
8. Consulta para localizar filas que bloqueen la migración 0004 en datos existentes.

Del dueño / externos: S.E. y cuenta comercial, abogado, pasarela de pago real, proveedor de SMS, términos y privacidad,
fotos de eventos (requiere campo de imagen + subida), rediseño v3 por aprobar.

## 6. Registro de cambios recientes

(Cada entrada: fecha, qué, por qué.)

- 2026-11-15/16 — Supabase conectado; admin del dueño (66632666) creado; páginas de administración protegidas a nivel de datos; rotación TOTP cierra sesiones.
- 2026-11-16 — Bloqueo de vendedores (SEG-08) ahora también al comprar (la entrada ya verificada de un vendedor bloqueado aparece como no disponible, sin revelar el motivo) y al aprobar una publicación (rechazar sigue permitido). Por qué: antes un vendedor bloqueado podía seguir vendiendo hasta 10 entradas ya verificadas.
- 2026-11-16 — Limitador de intentos: solo se guardan los intentos permitidos (un atacante ya no puede llenar la tabla con rechazos) y el bloqueo termina cuando sale de la ventana el intento permitido más antiguo; la purga diaria borra por lotes de 1000. Por qué: cada rechazo era una fila nueva y un borrado único podía ser enorme.
