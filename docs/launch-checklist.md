# Checklist de salida a producción (dinero real)

Estado al 2026-11-15: la v1 está completa y endurecida, pero **funciona solo en modo de prueba** (pasarela de
pago falsa, SMS por consola). No se cobra dinero real hasta que **todas** las casillas de las secciones 1 a 6
estén marcadas y la sección 8 esté firmada. Cada punto indica quién lo cierra.

Responsables: [Abogado] · [Negocio] fundador/operación · [Dev] desarrollo · [Seguridad] revisión de seguridad.

---

## 1. Bloqueos legales y de negocio (no son código)

- [ ] [Negocio] **S.E. constituida** y **cuenta bancaria comercial** a su nombre (los pagos manuales a vendedores salen
      de esa cuenta; DEL-06).
- [ ] [Abogado] **Custodia y retención de fondos.** El diseño no custodia dinero (DEL-11): cobra una pasarela
      licenciada y el pago al vendedor es una transferencia manual tras la ventana de 12 h. Confirmar por
      escrito que este modelo (cobro, retención hasta el evento, reembolso por disputa) no requiere licencia o
      autorización adicional, y qué debe decir el contrato con la pasarela.
- [ ] [Abogado] **Términos de boleteras y recintos sobre la reventa** (Panatickets, Ticketplus y otros; DEL-13):
      qué eventos prohíben la reventa o la transferencia y cómo se marca (`resaleProhibited`, `allowsTransfer`
      en cada evento). Riesgo aceptado: la boletera puede anular una entrada revendida; la plataforma solo
      garantiza el reembolso por disputa.
- [ ] [Abogado] **Ley 81 de 2019** (protección de datos personales; DEL-14): base legal y consentimiento para
      teléfono, cédula/pasaporte y selfie, derechos del titular, encargado del tratamiento (Vercel, Supabase,
      proveedor de SMS y pasarela) y transferencia internacional de datos.
- [ ] [Abogado] **Retención de documentos de identidad** (SEG-11): fijar el plazo y cargarlo en
      `app_config.identityRetentionDays` (hoy 365 días, valor provisional). El cron de mantenimiento borra el
      documento y la selfie al vencer el plazo. Fijar también el plazo del ledger y la auditoría (propuesta:
      ≥ 5 años, RNF-06); ambas tablas son solo-agregar y la base rechaza UPDATE, DELETE y TRUNCATE.
- [ ] [Abogado] [Negocio] **Términos y condiciones y política de privacidad: revisión legal.** Ya existen como texto base en
      `/terminos`, `/privacidad`, `/cookies` y `/reembolsos` (2026-11-19), con el tope de precio, la comisión, la ventana de
      disputa de 12 h y el bloqueo por disputas perdidas tomados del código. Falta que el abogado los apruebe y complete los
      marcadores `[COMPLETAR_…]`; la lista y el resto del trabajo externo están en `docs/seo-y-lanzamiento.md`. La casilla de
      aceptación del ingreso aún no se registra en la base de datos (ver sección 5 de esa guía).
- [ ] [Negocio] **Verificación con la pasarela elegida** (DEL-12): ¿permite dividir pagos (*split*), retener fondos o
      programar *payouts*? ¿Reembolso total por API con clave de idempotencia? ¿Plazo máximo para reembolsar?
      ¿Solo USD? ¿Webhooks firmados y con reintentos? Guardar las respuestas por escrito.

## 2. Pasarela de pago real

- [ ] [Dev] **Implementar el adaptador real de `PaymentGateway`** (`src/lib/payments/gateway.ts`) y devolverlo en
      `getPaymentGateway()` (`src/lib/payments/index.ts`). Contrato que el adaptador debe cumplir:
  - [ ] *Checkout* hospedado por el proveedor: nunca recibimos datos de tarjeta ni de Yappy (SEG-13).
  - [ ] **Monto verificado**: el checkout se crea por `amountCents` exactos y el webhook devuelve el monto
        cobrado; `handlePaymentWebhook` lo compara con la orden (si no coincide: 422 y alerta
        `payment_webhook_amount_mismatch`).
  - [ ] **Moneda USD**: el adaptador rechaza (`InvalidWebhookError`) cualquier notificación en otra moneda.
  - [ ] **Expiración del checkout ≤ 15 minutos** (`CHECKOUT_TTL_MS`), para que el proveedor no cobre una orden que
        el cron ya abandonó.
  - [ ] **Firma del webhook** verificada sobre el cuerpo crudo con el secreto del proveedor; cualquier fallo es
        `InvalidWebhookError` (400). Probar firma alterada, cuerpo alterado y reenvío del mismo evento.
  - [ ] **Reembolso idempotente por `providerRef`** (enviar la referencia como clave de idempotencia del
        proveedor): un reintento nunca reembolsa dos veces. La base además rechaza un segundo asiento `refund`
        por orden.
  - [ ] Pruebas de contrato contra el *sandbox* del proveedor: pago, pago tardío (orden ya abandonada → se
        reembolsa), webhook repetido, webhook fuera de orden, monto distinto, moneda distinta, reembolso repetido.
- [ ] [Dev] **Retirar la pasarela falsa**: borrar `ALLOW_FAKE_GATEWAY` y `FAKE_GATEWAY_SECRET` de las variables de
      Production en Vercel. Sin ellas, la página `/pago-de-prueba` y el `FakeGateway` no funcionan en producción.
- [ ] [Dev] **Proveedor de SMS real**: hoy `getSmsSender()` falla a propósito en producción y `/api/auth/request`
      responde 503 («Servicio no disponible»). Implementar un `SmsSender` real, fijar
      `app_config.smsDailyCap` (hoy 500 SMS cada 24 h, con alerta `sms_daily_cap_reached`) y el presupuesto
      mensual con el proveedor (RNF-12).

## 3. Datos, secretos y operación

- [ ] [Dev] **Copias de seguridad y prueba de restauración** (RNF-11, SEG-23): copias diarias en Supabase (PITR ≥ 7 días, requiere plan de pago);
      restaurar a una rama nueva, ejecutar `npm run db:migrate`, comprobar conteos de órdenes, ledger y
      auditoría, y anotar fecha, duración y resultado aquí: ______________________.
- [ ] [Dev] **Migraciones en el despliegue**: `npm run db:migrate` como paso explícito (no `AUTO_MIGRATE` en
      producción). La migración `0004_hardening` añade CHECK e índices únicos; sobre una base con datos de
      prueba, revisar antes que no haya filas que los violen (precio/comisión/montos ≤ 0, radio fuera de
      50–5000 m, dos `charge` o dos `refund` por orden, dos disputas abiertas por orden).
- [ ] [Dev] **Variables de entorno en Vercel**, separadas para Preview y Production (nunca el mismo secreto):
      `DATABASE_URL`, `FILE_URL_SECRET` (≥ 32 caracteres), `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`. El servidor de
      producción no arranca si falta alguna (`assertProductionEnv`, en `src/instrumentation.ts`).
- [ ] [Dev] **Rotación de secretos documentada** (SEG-15). Procedimiento: cambiar el valor en Vercel y volver a
      desplegar.
  - `FILE_URL_SECRET`: solo invalida las URL firmadas vigentes (duran 60 s).
  - `CRON_SECRET`: Vercel Cron envía el valor nuevo tras el despliegue.
  - `BLOB_READ_WRITE_TOKEN`: regenerarlo en Vercel Blob.
  - `DATABASE_URL`: restablecer la contraseña de la base en Supabase (Project Settings → Database) y actualizarla con `npm run db:set-password`.
  - Claves de la pasarela y del proveedor de SMS: en sus paneles.
  - TOTP de un administrador (teléfono perdido o sospecha de filtración): `npm run admin:create -- +507…` rota el
    secreto; el anterior deja de funcionar al instante.
- [ ] [Negocio] **`app_config` inicial** revisado: `smsDailyCap`, `maxLostDisputes` (3 disputas perdidas en 90 días
      bloquean al vendedor), `maxActiveListingsPerSeller` (10), `priceCapBps` (15000), `identityRetentionDays`.
- [ ] [Dev] **Alertas** (RNF-10): configurar un *Log Drain* de Vercel que avise (correo/WhatsApp) por cada línea
      JSON con `"alert": true`. Nombres actuales: `payment_webhook_failed`, `payment_webhook_amount_mismatch`,
      `maintenance_step_failed` (reembolso, liberación o purga fallida), `maintenance_run_failed`,
      `event_cancel_order_failed`, `sms_daily_cap_reached`, `cron_secret_missing`. Restringir quién lee los
      logs: no llevan teléfonos, cédulas, códigos ni tokens, pero sí ids de orden.
- [ ] [Negocio] **Operadores definidos**: quiénes son (nombre y teléfono de cada administrador), quién suple al
      fundador (DEL-15) y cómo se revoca un acceso (cambiar `users.role` a `user` y borrar sus sesiones).
- [ ] [Dev] **2FA de administradores**: cada administrador se crea con `npm run admin:create -- +507…`, que imprime
      el secreto TOTP una sola vez para la app autenticadora. No existe ninguna ruta HTTP para enrolar el 2FA.
      Cada código TOTP sirve una sola vez; se admiten 5 intentos cada 15 minutos por administrador.

## 4. Verificación en un *Preview* de Vercel

- [ ] [Dev] **Worker del lector QR**: `src/lib/tickets/qr-worker.mjs` y `jsqr` se incluyen en la función de
      `/api/listings` (`outputFileTracingIncludes` en `next.config.ts`). Publicar una entrada con QR y comprobar
      en la auditoría `method: 'qr'` y sin `qrScanTimedOut`.
- [ ] [Dev] **sharp en Vercel**: subida de identidad, publicación (reprocesado y EXIF eliminado) y descarga con
      marca de agua funcionan.
- [ ] [Negocio] **Marca de agua legible**: la entrada descargada por el comprador se puede leer con un lector QR real
      de puerta (idealmente el de la boletera o el recinto).
- [ ] [Dev] **CSP sin roturas**: `npm run check:headers -- https://<preview>.vercel.app` termina en «All header checks
      passed»; además recorrer en Chrome y Safari móviles inicio, ingreso, evento, compra, mis órdenes, vender,
      ingreso al evento, disputa y el panel admin con la consola abierta: ninguna violación de CSP, el service
      worker se registra y la PWA se instala.
- [ ] [Dev] **Cron**: `/api/cron/maintenance` responde 401 sin el secreto y Vercel Cron lo ejecuta cada 10 minutos
      con 200 (ver logs).
- [ ] [Dev] **Supabase**: cadena del *session pooler* por TCP (no un driver HTTP) con TLS verificado (`DATABASE_CA_CERT`): transacciones y `SELECT … FOR UPDATE` funcionan. Comprobar con `npm run db:check`.
      Prueba: dos navegadores compran la misma entrada a la vez → una sola orden; repetir un webhook → un solo
      cargo en el ledger.
- [ ] [Dev] **Subidas desde el móvil** (identidad, publicación, ingreso, disputa): no se probaron en navegador en la
      v1; comprobar también fotos grandes frente al límite de 4.5 MB por solicitud de Vercel (la app las reduce a
      ≤ 3 MB).
- [ ] [Dev] **Límites de tasa**: los 429 llevan `Retry-After`; la IP usada es la de `x-forwarded-for` que fija Vercel.

## 5. Protecciones implementadas (referencia para la revisión)

| Requisito | Dónde |
|---|---|
| SEG-16 cabeceras: CSP con *nonce* por respuesta (scripts sin `unsafe-inline`), HSTS 2 años, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara y ubicación solo propias), `frame-ancestors 'none'` | `src/proxy.ts`, `next.config.ts`, `src/lib/security/headers.ts`; `npm run check:headers` |
| SEG-17 CSRF en rutas API: JSON o multipart con Origin obligatorio; DELETE con Origin | `src/lib/auth/http.ts`; prueba que recorre todas las rutas: `src/app/api/csrf.test.ts` |
| SEG-17 CSRF en *server actions* (panel admin, `/pago-de-prueba`): Next.js compara `Origin` con `Host` (o `X-Forwarded-Host`) y aborta si no coinciden; no hay `serverActions.allowedOrigins` configurado, así que solo el mismo host puede invocarlas. Cada acción revisa además sesión y 2FA (`requireAdminPage`) | `src/app/admin/(panel)/actions.ts`, `src/app/pago-de-prueba/[ref]/actions.ts` |
| SEG-17 XSS: React escapa todo el texto; no se usa `dangerouslySetInnerHTML` | — |
| SEG-05/06 autorización por ruta, probada como anónimo, otro usuario, la otra parte de la orden, admin sin 2FA, admin y dueño; una ruta nueva sin clasificar hace fallar la prueba | `src/app/api/authz-matrix.test.ts` |
| SEG-07 límites de tasa (por usuario o IP) y tope diario de SMS con alerta | `src/lib/security/limits.ts`, `src/lib/auth/otp.ts` |
| SEG-08 máximo de publicaciones activas y bloqueo tras disputas perdidas | `src/lib/tickets/listings.ts` |
| SEG-04 TOTP de un solo uso por paso, sin sobrescritura accidental del secreto | `src/lib/auth/totp.ts` |
| RNF-05 respaldos en la base: CHECK de montos y radio, un cargo y un reembolso por orden, una disputa abierta por orden, ledger y auditoría sin TRUNCATE | `drizzle/0004_hardening.sql`, `drizzle/0005_no_truncate.sql` |
| RNF-10 / SEG-12 logs JSON sin datos personales y alertas | `src/lib/observability/log.ts` |
| SEG-15 arranque bloqueado sin secretos de producción | `src/lib/config/env.ts` |

## 6. Dependencias

- [ ] [Seguridad] `npm audit --omit=dev` sin vulnerabilidades altas o críticas. Al 2026-11-15: **0** (tras forzar el `zod`
      anidado de `@vercel/cli-config` a la versión 4.6.x de la app). Quedan avisos solo en dependencias de
      desarrollo (`drizzle-kit`, `@vercel/config`) que no se despliegan.
- [ ] [Seguridad] Revisión mensual de dependencias y actualizaciones de seguridad (SEG-22); responsable: __________.

## 7. Riesgos residuales aceptados hasta hoy

Resumen de lo diferido en las revisiones de las tareas 1–13. Ninguno bloquea las pruebas; los marcados «(antes del dinero real)» deben
resolverse o aceptarse por escrito antes de cobrar.

**Pagos y ledger**
- (antes del dinero real) Si un reembolso falla, la transacción se revierte y solo queda la alerta en logs: añadir un registro de
  auditoría en transacción aparte junto con el adaptador real.
- (antes del dinero real) Un monto distinto en el webhook solo se audita y alerta; el 422 hace que el proveedor reintente. Definir el
  procedimiento manual (`needsManualReview` ya tiene lista de solo lectura en `/admin/revision`; falta el flujo para resolverlas).
- `paidAt` es la hora de recepción del webhook; `appendEntry` no impone el signo de cada tipo de asiento.
- No hay tope por comprador de checkouts abiertos; el límite de 20 checkouts por hora lo acota.

- (antes del dinero real) Si un evento se cancela cuando la orden ya está `liquidada` (al vendedor ya se le pagó), no hay
  reembolso automático: queda marcada `needsManualReview` y aparece en `/admin/revision`; hay que recuperar el pago del
  vendedor o reembolsar al comprador de la cuenta de la empresa.
- (antes del dinero real) La migración 0004 añade restricciones: si hay datos previos que las violen, falla. Antes de
  migrar una base con datos reales, revisar a mano las filas que incumplan los CHECK/índices únicos parciales de
  `drizzle/0004_hardening.sql` (pegar sus condiciones como `SELECT` en el editor SQL de Supabase y esperar 0 filas).
- Las alertas ya incluyen `orderId`/`eventId`/`itemId` para localizar el caso sin buscar en la base.

**Publicaciones y entradas**
- El QR del comprobante no se indexa (pequeña ventana de carrera para publicar dos veces la misma entrada); un
  archivo con QR dañado y un comprobante sin QR solo se detectan en la revisión manual.
- La cola de escaneo QR está acotada por vendedor (10 publicaciones por hora), no globalmente.
- Marca de agua generada en cada descarga (costosa en imágenes enormes); una imagen diminuta da un error 500
  genérico. Falta probar la legibilidad con un lector real (sección 4).

**Archivos y datos personales**
- Al reenviar la identidad quedan blobs huérfanos del envío anterior; el token firmado viaja en la ruta de la URL
  (aparece en logs de acceso, dura 60 s).
- Next.js registra por su cuenta los errores no capturados de las páginas con el mensaje completo de la consulta
  (incluidos sus parámetros, p. ej. el hash SHA-256 del token de sesión, nunca el token); las páginas no consultan
  por teléfono, pero el acceso a los logs debe restringirse.

**Autorización y sesiones**
- Algunas rutas de órdenes y publicaciones responden 403 en vez de 404 a un id ajeno (revela que el id existe; los
  ids son UUID aleatorios).
- No hay CAPTCHA tras fallos ni aviso de nuevo dispositivo; no se rota el token de sesión al completar el 2FA.
- La IP de los límites sale de `x-forwarded-for`; fuera de Vercel debe haber un proxy de confianza delante, y sin
  cabeceras todos comparten el cubo «unknown».
- La CSP permite `style-src 'unsafe-inline'` (React escribe atributos `style` en el HTML del servidor).

**Mantenimiento y modelo de datos**
- Las órdenes con `needsManualReview` no se liberan solas y solo tienen lista de lectura en `/admin/revision`; `confirmEntry` no
  revisa si el evento sigue activo; las rutas de evidencia no quedan ligadas a una sola orden.
- Los estados de texto (`state`, `status`, `role`) se validan en TypeScript, no con CHECK en la base; el teléfono
  E.164 tampoco tiene CHECK.

**Decisiones registradas (rulings)**
- Sin ruta HTTP para enrolar el TOTP: el primer administrador y las rotaciones se hacen con `npm run admin:create`.
- Acciones del panel como *server actions* (protección de Origin incluida en Next.js).
- Sin pruebas e2e con navegador (Playwright): las cubren las pruebas de rutas y la prueba manual de la tarea 12.
- Imágenes reducidas en el cliente (≤ 2000 px, ≤ 3 MB) por el límite de Vercel; la página `/pago-de-prueba` solo
  existe con la pasarela falsa.

## 8. Firmas

| Rol | Nombre | Fecha | Firma |
|---|---|---|---|
| Fundador / operador principal | | | |
| Abogado (secciones 1 y 7) | | | |
| Revisión de seguridad independiente de la rama completa (SEG-23) | | | |
| Prueba de restauración de copias (RNF-11) | | | |
