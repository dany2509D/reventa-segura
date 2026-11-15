# Reventa Segura v1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la PWA de reventa de entradas para Panamá, lista para producción con pagos de prueba (pagos reales quedan fuera de este plan).

**Architecture:** Next.js (App Router, TypeScript) con Postgres. Toda la lógica de negocio vive en `src/lib/*` como módulos puros o con acceso a BD por inyección, probados con Vitest sobre PGlite (Postgres en memoria). Pasarela de pago y payout van detrás de interfaces (`PaymentGateway`, `PayoutAdapter`) con implementaciones falsas/manuales. Cada orden sigue una máquina de estados y un libro contable de solo-agregar.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, Postgres (Neon en producción, PGlite en tests), Zod, Vitest, sharp + jsQR (QR y marca de agua), Vercel Blob privado, Playwright (humo e2e), Vercel (despliegue, cron).

**Spec:** `docs/superpowers/specs/2026-11-15-reventa-segura-design.md` y `docs/superpowers/specs/2026-11-15-reventa-segura-requisitos.md` (RF, RNF, delimitantes y SEG; los ids `SEG-xx` abajo remiten a este último)

## Global Constraints

- Solo español en la UI. Móvil primero. Mercado: Panamá, moneda USD (centavos enteros, `amountCents`).
- Teléfono en formato E.164 (`+507XXXXXXXX`) como identidad.
- Comisión: 10% al vendedor (`feeBps = 1000`), configurable. Tope de sobreprecio configurable (`priceCapBps`, valor inicial **150% del valor nominal = 15000**, llamada del constructor).
- Ventana de confirmación y disputa: hasta **12 h** después del inicio del evento.
- Plazo de transferencia del vendedor: **2 h** tras el pago (o antes del evento si queda menos tiempo). Llamada del constructor.
- Evento cancelado = reembolso total. El comprador no cancela tras pagar. El vendedor puede retirar su publicación antes de una venta.
- Eventos solo los crea el administrador. Valor nominal lo ingresa el administrador.
- Datos de tarjeta/Yappy nunca pasan por nuestros servidores (checkout alojado de la pasarela).
- Documentos de identidad y capturas: almacenamiento privado, acceso solo por URL firmada de corta duración.
- La plataforma no custodia dinero: el pago al vendedor es transferencia manual detrás de `PayoutAdapter`.
- Ledger inmutable: sin UPDATE ni DELETE sobre `ledger_entries`.
- Geolocalización es señal de apoyo, no bloqueo.
- Seguridad (requisitos SEG): sesión en cookie `httpOnly; Secure; SameSite=Lax` (nunca `localStorage`); sesión de usuario 30 días y de administrador 8 horas; OTP de 6 dígitos, 10 min, máximo 5 intentos; subidas solo JPEG/PNG/WebP/PDF de hasta 8 MB, validadas por contenido; URL firmada de 60 s para documentos; el service worker nunca guarda en caché respuestas de API ni datos de usuario; los registros no contienen teléfono, cédula ni tokens; toda acción de administrador y todo cambio de estado de orden escribe en `audit_log`.

## Review Focus

1. Webhook de pago entregado dos veces o fuera de orden → la orden se paga una sola vez, un solo asiento contable. (Task 6)
2. Dos compradores simultáneos sobre la misma publicación → solo uno obtiene la orden. (Task 6)
3. Teléfonos en formatos variados (`6123-4567`, `+507 6123 4567`, `50761234567`) → misma identidad normalizada; no panameños se rechazan. (Task 3)
4. Evento cancelado con órdenes en distintos estados → reembolsos correctos, ninguno doble. (Task 9)
5. Disputa abierta justo cuando corre la liberación automática → gana de forma determinista una sola (bloqueo de fila). (Task 8)

---

## Estructura de archivos

```
src/lib/db/{schema.ts,client.ts,test-db.ts}   esquema Drizzle, cliente, BD en memoria para tests
src/lib/pricing/pricing.ts                      comisión y tope de precio
src/lib/orders/{state-machine.ts,ledger.ts,service.ts}
src/lib/auth/{phone.ts,otp.ts,session.ts}
src/lib/identity/identity.ts                    verificación de vendedor
src/lib/events/events.ts
src/lib/tickets/{fingerprint.ts,listings.ts,watermark.ts}
src/lib/payments/{gateway.ts,fake-gateway.ts}
src/lib/payouts/payouts.ts
src/lib/entry/{geo.ts,confirmation.ts}
src/lib/disputes/disputes.ts
src/lib/jobs/maintenance.ts                     expira transferencias, libera por ventana
src/app/**                                      páginas y rutas API
vercel.ts                                       cron
```

---

### Task 1: Andamiaje, esquema y BD de pruebas

**Files:**
- Create: proyecto Next.js (en carpeta elegida por el usuario), `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/test-db.ts`, `vitest.config.ts`, `drizzle.config.ts`
- Test: `src/lib/db/schema.test.ts`

**Interfaces:**
- Produces: `schema` con tablas `users(id, phone unique, role 'user'|'admin', identityStatus 'none'|'pending'|'approved'|'rejected')`, `events(id, name, venue, lat, lng, radiusM, startsAt, faceValueCents, allowsTransfer bool, resaleProhibited bool, status 'active'|'cancelled')`, `listings(id, sellerId, eventId, askCents, deliveryMode 'transfer'|'file', status 'pending'|'verified'|'rejected'|'sold'|'withdrawn', fingerprint unique-when-active, proofPath, filePath nullable)`, `orders(id, listingId, buyerId, state, priceCents, feeCents, providerRef, transferDeadline, createdAt)`, `ledger_entries(id, orderId, kind, amountCents, ref, createdAt)`, `disputes`, `payouts`, `otp_codes`, `sessions`, `app_config(key, value)`, `audit_log(id, actorId, action, entity, entityId, detail jsonb, createdAt)` (solo-agregar, mismo trigger que el ledger); `audit(tx: Tx, e: { actorId: string | null; action: string; entity: string; entityId: string; detail?: object }): Promise<void>` en `src/lib/audit/audit.ts`; `makeTestDb(): Promise<Db>` (PGlite con migraciones aplicadas); `Db` tipo del cliente Drizzle.

- [ ] **Step 1:** `git init`; crear app Next.js TypeScript con App Router; instalar `drizzle-orm`, `@electric-sql/pglite`, `zod`, `vitest`.
- [ ] **Step 2: Test que falla** `schema.test.ts`: `it('rejects duplicate phone')` (insertar dos `users` con mismo `phone` → rechaza); `it('blocks UPDATE on ledger_entries')` (insertar fila y luego `UPDATE` → lanza error del trigger); `it('blocks DELETE on ledger_entries')` igual; `it('blocks UPDATE and DELETE on audit_log')`; `audit()` inserta una fila con `actorId` nulo permitido (acciones del sistema). Desde aquí, T6, T8, T9, T10 y T11 llaman `audit()` dentro de la misma transacción de cada cambio de estado o acción de administrador, y sus tests afirman la fila de auditoría.
- [ ] **Step 3:** Run `npx vitest run src/lib/db` → FAIL (módulos no existen).
- [ ] **Step 4:** Implementar `schema.ts`, migración SQL con trigger que impide UPDATE/DELETE en `ledger_entries`, y `makeTestDb()`.
- [ ] **Step 5:** Run `npx vitest run src/lib/db` → PASS.
- [ ] **Step 6:** Commit `feat: scaffold, schema and in-memory test db`.

### Task 2: Precios y tope de sobreprecio

**Files:** Create `src/lib/pricing/pricing.ts`; Test `src/lib/pricing/pricing.test.ts`

**Interfaces:**
- Produces: `computeFees(priceCents: number, feeBps: number): { feeCents: number; sellerNetCents: number }`; `isPriceAllowed(askCents: number, faceValueCents: number, priceCapBps: number): boolean`.

- [ ] **Step 1: Test que falla:** `computeFees(5000, 1000)` → `{ feeCents: 500, sellerNetCents: 4500 }`; `computeFees(999, 1000)` redondea la comisión hacia arriba (`feeCents: 100`) y `feeCents + sellerNetCents === 999`; `isPriceAllowed(7500, 5000, 15000)` → `true`; `isPriceAllowed(7501, 5000, 15000)` → `false`; `askCents <= 0` → `false`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS. **Step 5:** Commit `feat: pricing and price cap`.

### Task 3: Teléfono, OTP y sesiones

**Files:** Create `src/lib/auth/{phone.ts,otp.ts,session.ts}`, `src/app/api/auth/{request,verify}/route.ts`; Test `src/lib/auth/auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `users`, `otp_codes`, `sessions` (Task 1).
- Produces: `normalizePanamaPhone(input: string): string | null`; `requestOtp(db: Db, phone: string, sender: SmsSender, now?: Date): Promise<void>`; `verifyOtp(db: Db, phone: string, code: string, now?: Date): Promise<{ userId: string; sessionToken: string } | null>`; `getSession(db: Db, token: string): Promise<{ userId: string; role: string } | null>`; `interface SmsSender { send(phone: string, text: string): Promise<void> }` con `ConsoleSmsSender` para desarrollo.

- [ ] **Step 1: Test que falla:** `normalizePanamaPhone('6123-4567')`, `'+507 6123 4567'`, `'50761234567'` → todos `'+50761234567'`; `'+14155550100'` → `null`; `'123'` → `null`. `verifyOtp` con código correcto crea usuario y sesión; con código incorrecto → `null`; con código de más de 10 min → `null`; código reutilizado → `null`; sexto `requestOtp` en una hora para el mismo teléfono → lanza `RateLimitError`; el código se guarda hasheado (la fila no contiene el código en claro); el sexto intento fallido sobre un mismo código lo invalida; una sesión `admin` expira a las 8 h y una `user` a los 30 días. **2FA de administrador (SEG-04):** `enrollTotp(db: Db, adminId: string): Promise<{ secret: string; otpauthUrl: string }>` y `verifyTotp(db: Db, adminId: string, code: string, now?: Date): Promise<boolean>`; `getSession` devuelve `mfa: boolean` y `requireAdmin` (T11) exige `mfa === true`; test: código TOTP correcto → `true`, código de la ventana anterior ±30 s → `true`, código viejo → `false`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar (código de 6 dígitos, hash SHA-256 con sal, sesión aleatoria de 32 bytes guardada como hash, cookie `httpOnly`). **Step 4:** Run → PASS. **Step 5:** Commit `feat: phone otp auth`.

### Task 4: Eventos, verificación de identidad y módulo de subidas

**Files:** Create `src/lib/events/events.ts`, `src/lib/identity/identity.ts`, `src/lib/uploads/uploads.ts`; Test `events.test.ts`, `identity.test.ts`, `uploads.test.ts`

**Subidas (SEG-09/10), usadas también por T5, T7 y T8:** `validateUpload(file: Buffer, declaredType: string): Promise<{ type: 'jpeg'|'png'|'webp'|'pdf'; clean: Buffer }>` lanza `InvalidUploadError`; `storePrivate(clean: Buffer, kind: 'identity'|'proof'|'ticket'|'evidence'|'selfie'): Promise<string>` (devuelve ruta en Blob privado); `signedUrl(path: string, actor: Actor, ttlSeconds = 60): Promise<string>` y registra la lectura con `audit()`. Tests: un `.exe` renombrado `.jpg` → rechazado; archivo de 9 MB → rechazado; PNG con EXIF → `clean` sin metadatos; `signedUrl` de un documento de identidad por un usuario que no es su dueño ni admin → `ForbiddenError`.

**Interfaces:**
- Consumes: `Db`, sesiones (Task 3).
- Produces: `createEvent(db: Db, actor: Actor, input: NewEvent): Promise<EventRow>` (solo `role === 'admin'`, si no lanza `ForbiddenError`); `submitIdentity(db: Db, userId: string, docPath: string, selfiePath: string): Promise<void>` → `identityStatus = 'pending'`; `reviewIdentity(db: Db, admin: Actor, userId: string, decision: 'approved'|'rejected'): Promise<void>`; `assertCanSell(db: Db, userId: string): Promise<void>` lanza `IdentityRequiredError` si no está `approved`.

- [ ] **Step 1: Test que falla:** usuario no admin no puede `createEvent`; admin sí y `faceValueCents` debe ser > 0; `assertCanSell` falla con `none`, `pending`, `rejected` y pasa con `approved`; solo admin puede `reviewIdentity`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. Las rutas de subida usan Vercel Blob privado y guardan solo la ruta. **Step 5:** Commit `feat: events and seller identity`.

### Task 5: Publicación de entradas y detección de duplicados

**Files:** Create `src/lib/tickets/{fingerprint.ts,listings.ts}`; Test `fingerprint.test.ts`, `listings.test.ts`

**Interfaces:**
- Consumes: `assertCanSell` (Task 4), `isPriceAllowed` (Task 2), `events`, `listings`.
- Produces: `extractQrPayload(image: Buffer): Promise<string | null>`; `computeFingerprint(file: Buffer): Promise<string>` (SHA-256 del contenido del QR si hay, si no del archivo); `createListing(db: Db, input: { sellerId: string; eventId: string; askCents: number; deliveryMode: 'transfer'|'file'; proof: Buffer; file?: Buffer }): Promise<Listing>`; `reviewListing(db: Db, admin: Actor, listingId: string, decision: 'verified'|'rejected'): Promise<void>`; `withdrawListing(db: Db, sellerId: string, listingId: string): Promise<void>`.

- [ ] **Step 1: Test que falla:** dos imágenes distintas con el mismo QR → mismo fingerprint; segunda `createListing` con el mismo fingerprint activo → lanza `DuplicateTicketError`; vendedor sin identidad aprobada → `IdentityRequiredError`; precio sobre el tope → `PriceCapError`; evento con `status = 'cancelled'` o ya empezado → `EventClosedError`; `deliveryMode: 'transfer'` en evento con `allowsTransfer = false` → error; evento con `resaleProhibited = true` → no se permite publicar; `withdrawListing` falla si la publicación está `sold`; fingerprint de una publicación `rejected` o `withdrawn` no bloquea una nueva.
- [ ] **Step 2–4:** FAIL → implementar (índice único parcial sobre `fingerprint` para estados activos) → PASS. **Step 5:** Commit `feat: listings with duplicate detection`.

### Task 6: Máquina de estados, ledger, pasarela y compra

**Files:** Create `src/lib/orders/{state-machine.ts,ledger.ts,service.ts}`, `src/lib/payments/{gateway.ts,fake-gateway.ts}`, `src/app/api/{checkout,webhooks/payments}/route.ts`; Test `state-machine.test.ts`, `ledger.test.ts`, `service.test.ts`

**Interfaces:**
- Consumes: `computeFees` (Task 2), `listings`, `orders`, `ledger_entries`.
- Produces:
  - `type OrderState = 'creada'|'pagada'|'transferencia_pendiente'|'entrada_recibida'|'ingreso_confirmado'|'disputada'|'liberada'|'liquidada'|'reembolsada'|'cancelada'`
  - `type OrderEvent = 'PAID_TRANSFER'|'PAID_FILE'|'TRANSFER_EXPIRED'|'RECEIVED_CONFIRMED'|'ENTRY_CONFIRMED'|'WINDOW_ELAPSED'|'DISPUTE_OPENED'|'DISPUTE_REFUND'|'DISPUTE_RELEASE'|'EVENT_CANCELLED'|'PAYOUT_DONE'|'CHECKOUT_ABANDONED'`
  - `transition(state: OrderState, event: OrderEvent): OrderState` lanza `InvalidTransitionError` si no existe.
  - `appendEntry(tx: Tx, e: { orderId: string; kind: 'charge'|'fee'|'seller_due'|'refund'|'payout'; amountCents: number; ref: string }): Promise<void>`; `sellerPendingCents(db: Db, sellerId: string): Promise<number>`.
  - `interface PaymentGateway { createCheckout(i: { orderId: string; amountCents: number }): Promise<{ checkoutUrl: string; providerRef: string }>; parseWebhook(rawBody: string, headers: Record<string,string>): { providerRef: string; status: 'paid'|'failed' }; refund(providerRef: string, amountCents: number): Promise<{ refundRef: string }> }`
  - `startCheckout(db: Db, gw: PaymentGateway, buyerId: string, listingId: string): Promise<{ orderId: string; checkoutUrl: string }>`; `handlePaymentWebhook(db: Db, gw: PaymentGateway, rawBody: string, headers: Record<string,string>): Promise<void>`.

- [ ] **Step 1: Test que falla:** transiciones válidas: `creada --PAID_TRANSFER--> transferencia_pendiente`, `creada --PAID_FILE--> entrada_recibida`, `transferencia_pendiente --RECEIVED_CONFIRMED--> entrada_recibida`, `entrada_recibida --ENTRY_CONFIRMED--> ingreso_confirmado`, `ingreso_confirmado|entrada_recibida --WINDOW_ELAPSED--> liberada`, `liberada --PAYOUT_DONE--> liquidada`, `{transferencia_pendiente|entrada_recibida|ingreso_confirmado} --DISPUTE_OPENED--> disputada`, `creada --CHECKOUT_ABANDONED--> cancelada`, `disputada --DISPUTE_REFUND--> reembolsada`, `disputada --DISPUTE_RELEASE--> liberada`; inválida: `liquidada --DISPUTE_OPENED` y `reembolsada --PAYOUT_DONE` lanzan error. Ledger: `UPDATE` rechazado (Task 1); un pago de 5000 con comisión 10% deja `charge +5000`, `fee -500`, `seller_due +4500` y `sellerPendingCents === 4500`. `startCheckout`: comprador igual al vendedor → error; publicación no `verified` → error; **dos `startCheckout` simultáneos sobre la misma publicación → exactamente uno tiene éxito** (la publicación pasa a `sold` con bloqueo de fila). **El mismo webhook `paid` entregado dos veces → un solo asiento `charge` y una sola transición**; webhook `paid` tras `CHECKOUT_ABANDONED` → se registra y se reembolsa; webhook con firma inválida (FakeGateway) → rechazado. Tras el pago, `transferDeadline = min(pago + 2 h, inicio del evento)` para `transfer`.
- [ ] **Step 2–4:** FAIL → implementar (transiciones como tabla `Record<OrderState, Partial<Record<OrderEvent, OrderState>>>`; operaciones en una transacción con `SELECT ... FOR UPDATE`; `FakeGateway` firma con HMAC) → PASS. **Step 5:** Commit `feat: order state machine, ledger and checkout`.

### Task 7: Entrega de la entrada (transferencia y archivo con marca de agua)

**Files:** Create `src/lib/tickets/watermark.ts`; Modify `src/lib/orders/service.ts`; Test `watermark.test.ts`, `delivery.test.ts`

**Interfaces:**
- Consumes: `transition`, `orders`, `listings` (Task 6).
- Produces: `watermark(image: Buffer, text: string): Promise<Buffer>`; `confirmReceived(db: Db, buyerId: string, orderId: string, screenshotPath: string): Promise<void>` (`transferencia_pendiente → entrada_recibida`); `getDeliveredFile(db: Db, buyerId: string, orderId: string): Promise<Buffer>` (solo comprador, solo con orden pagada, con marca de agua del teléfono del comprador).

- [ ] **Step 1: Test que falla:** `watermark` devuelve un buffer distinto de la entrada y aún decodificable como imagen; `confirmReceived` por un usuario que no es el comprador → `ForbiddenError`; `getDeliveredFile` con orden `creada` (impaga) → `ForbiddenError`; con `deliveryMode: 'transfer'` → error (no hay archivo).
- [ ] **Step 2–4:** FAIL → implementar con `sharp` (texto SVG superpuesto) → PASS. **Step 5:** Commit `feat: ticket delivery`.

### Task 8: Confirmación de ingreso, disputas y liberación

**Files:** Create `src/lib/entry/{geo.ts,confirmation.ts}`, `src/lib/disputes/disputes.ts`, `src/lib/jobs/maintenance.ts`, `src/app/api/cron/maintenance/route.ts`, `vercel.ts`; Test `geo.test.ts`, `confirmation.test.ts`, `disputes.test.ts`, `maintenance.test.ts`

**Interfaces:**
- Consumes: `transition`, `appendEntry`, `PaymentGateway.refund` (Task 6).
- Produces: `isWithinRadius(p: { lat: number; lng: number }, venue: { lat: number; lng: number }, radiusM: number): boolean` (haversine); `confirmEntry(db: Db, buyerId: string, orderId: string, input: { lat: number; lng: number; photoPath: string }, now?: Date): Promise<{ geoOk: boolean }>`; `confirmationWindowEndsAt(startsAt: Date): Date` (= inicio + 12 h); `openDispute(db: Db, buyerId: string, orderId: string, reason: string, evidencePaths: string[], now?: Date): Promise<void>`; `resolveDispute(db: Db, gw: PaymentGateway, admin: Actor, disputeId: string, decision: 'refund'|'release'): Promise<void>`; `runMaintenance(db: Db, gw: PaymentGateway, now: Date): Promise<{ expiredTransfers: number; released: number }>`.

- [ ] **Step 1: Test que falla:** `isWithinRadius` con puntos a 100 m y 5 km del recinto con radio 300 m → `true`/`false`; `confirmEntry` fuera del radio **no** bloquea: devuelve `geoOk: false` y avanza a `ingreso_confirmado`; sin `photoPath` → error; `confirmationWindowEndsAt(2026-12-01T20:00Z)` → `2026-12-02T08:00Z`; `openDispute` después de cerrada la ventana → `DisputeWindowClosedError`; `openDispute` por quien no es el comprador → `ForbiddenError`; `resolveDispute('refund')` llama `gw.refund` una vez y deja `reembolsada` con asiento `refund`; `runMaintenance`: transferencias vencidas (`transferDeadline` pasado, estado `transferencia_pendiente`) → reembolso automático y `expiredTransfers = 1`; órdenes `entrada_recibida`/`ingreso_confirmado` con ventana cumplida y sin disputa → `liberada`; **disputa abierta y mantenimiento concurrentes sobre la misma orden → termina en un único estado coherente (`disputada` o `liberada`, nunca ambos) y ningún doble reembolso**; ejecutar `runMaintenance` dos veces seguidas es idempotente. **Retención (SEG-11):** `runMaintenance` también borra de Blob y limpia las rutas de documentos de identidad y selfies de usuarios cuyo último pedido terminó hace más de `app_config.identityRetentionDays` (valor por defecto 365, a definir con el abogado) y devuelve `purgedIdentities`; test: un usuario con orden abierta o dentro del plazo no se purga.
- [ ] **Step 2–4:** FAIL → implementar (todo bajo `FOR UPDATE` sobre la orden; `vercel.ts` con cron cada 10 min a `/api/cron/maintenance` protegido por secreto) → PASS. **Step 5:** Commit `feat: entry confirmation, disputes and release`.

### Task 9: Cancelación de evento, retiro y reembolsos

**Files:** Modify `src/lib/events/events.ts`; Test `cancellation.test.ts`

**Interfaces:**
- Consumes: `PaymentGateway.refund`, `transition`, `appendEntry`.
- Produces: `cancelEvent(db: Db, gw: PaymentGateway, admin: Actor, eventId: string): Promise<{ refunded: number }>`.

- [ ] **Step 1: Test que falla:** evento con 4 órdenes en estados `transferencia_pendiente`, `entrada_recibida`, `liberada`, `disputada` → las cuatro quedan `reembolsada` con un asiento `refund` cada una (total de llamadas a `gw.refund` = 4); orden ya `liquidada` → no se reembolsa por el gateway, se marca para revisión manual (`needsManualReview = true`); órdenes `reembolsada` previas no se vuelven a reembolsar; `cancelEvent` dos veces → segunda ejecución reembolsa 0; publicaciones `verified` sin vender pasan a `withdrawn`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** Commit `feat: event cancellation refunds`.

### Task 10: Pago manual al vendedor

**Files:** Create `src/lib/payouts/payouts.ts`; Test `payouts.test.ts`

**Interfaces:**
- Consumes: `orders` en estado `liberada`, `appendEntry`.
- Produces: `interface PayoutAdapter { requestPayout(i: { orderId: string; sellerId: string; amountCents: number }): Promise<{ payoutId: string }> }`; `ManualPayoutAdapter` (inserta fila `payouts` `queued`); `markPayoutPaid(db: Db, admin: Actor, payoutId: string, bankRef: string): Promise<void>` (asiento `payout`, orden `liquidada`).

- [ ] **Step 1: Test que falla:** al pasar a `liberada` se crea exactamente un payout `queued` por orden con `amountCents = sellerNetCents`; `markPayoutPaid` por no-admin → `ForbiddenError`; pagar dos veces el mismo payout → error; orden `reembolsada` nunca genera payout; `sellerPendingCents` baja a 0 tras el pago.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** Commit `feat: manual payouts`.

### Task 11: Panel de administración

**Files:** Create `src/app/admin/{page.tsx,listings/,identities/,disputes/,payouts/,events/}`, `src/lib/admin/guard.ts`; Test `src/lib/admin/guard.test.ts`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `reviewListing`, `reviewIdentity`, `resolveDispute`, `markPayoutPaid`, `createEvent`, `cancelEvent`.
- Produces: `requireAdmin(db: Db, token: string | undefined): Promise<Actor>` lanza `ForbiddenError`.

- [ ] **Step 1: Test que falla:** `requireAdmin` sin sesión o con rol `user` → `ForbiddenError`; con `admin` → `Actor`; e2e: usuario normal visitando `/admin` es redirigido a `/`.
- [ ] **Step 2–4:** FAIL → implementar colas (publicaciones pendientes, identidades pendientes, disputas abiertas, payouts en cola), URLs firmadas para ver documentos → PASS. **Step 5:** Commit `feat: admin panel`.

### Task 12: Interfaz móvil para compradores y vendedores (PWA)

**Files:** Create `src/app/{page.tsx,eventos/[id]/page.tsx,vender/page.tsx,comprar/[listingId]/page.tsx,mis-ordenes/page.tsx,ingreso/[orderId]/page.tsx}`, `public/manifest.webmanifest`, `public/sw.js`; Test `e2e/flows.spec.ts`

**Interfaces:**
- Consumes: todos los módulos de `src/lib/*`.

- [ ] **Step 1: Test e2e que falla (Playwright, móvil 375×812, FakeGateway):** flujo completo: vendedor aprobado publica → admin verifica → comprador abre `/eventos/:id`, ve la publicación, paga con checkout falso, ve `transferencia_pendiente` con cuenta regresiva, confirma recepción, el día del evento confirma ingreso, y tras la ventana la orden aparece `liberada`; un evento con `resaleProhibited` muestra el aviso "Este evento prohíbe la reventa" y no permite publicar; ninguna página tiene scroll horizontal.
- [ ] **Step 2–4:** FAIL → implementar (manifest instalable, service worker mínimo solo con caché de la shell, textos en español, avisos claros de riesgo de reventa) → PASS. **Step 5:** Commit `feat: mobile pwa ui`.

### Task 13: Endurecimiento, observabilidad y checklist de salida a producción

**Files:** Modify `next.config.ts`, `src/middleware.ts`; Create `src/lib/security/rate-limit.ts`, `src/lib/security/csrf.ts`, `src/lib/observability/log.ts`, `docs/launch-checklist.md`; Test `src/lib/security.test.ts`, `src/lib/security/rate-limit.test.ts`, `e2e/authz-matrix.spec.ts`

**Interfaces:**
- Produces: `rateLimit(db: Db, key: string, limit: number, windowSeconds: number, now?: Date): Promise<{ allowed: boolean; retryAfterSeconds: number }>`; `assertSameOrigin(req: Request): void` lanza `CsrfError`; `log(level: 'info'|'warn'|'error', msg: string, ctx?: Record<string, unknown>): void` que elimina del contexto las claves `phone`, `cedula`, `token`, `code`.
- Límites aplicados: OTP (por teléfono y por IP), publicación, compra, apertura de disputa y subida de archivos (SEG-07); tope diario de SMS con alerta (`app_config.smsDailyCap`); máximo de publicaciones activas por vendedor y bloqueo tras 3 disputas perdidas (SEG-08).

- [ ] **Step 1: Test que falla:** `rateLimit` permite `limit` llamadas y la siguiente devuelve `allowed: false` con `retryAfterSeconds > 0`, y vuelve a permitir pasada la ventana; `assertSameOrigin` rechaza `Origin` ajeno en POST; `log` con `{ phone: '+507...' }` no emite el teléfono; **matriz de autorización (SEG-06):** para cada ruta API de escritura y lectura de datos privados, el e2e prueba anónimo → 401, usuario ajeno → 403, dueño → 200, y admin donde corresponda; el service worker no cachea `/api/*` (prueba leyendo `sw.js`); respuestas incluyen `Content-Security-Policy` con `frame-ancestors 'none'` y sin `unsafe-inline` en scripts, `Strict-Transport-Security`, `Permissions-Policy` que solo permite cámara y geolocalización, `X-Content-Type-Options: nosniff` y `Referrer-Policy`; `/api/cron/maintenance` sin secreto → 401; `/api/webhooks/payments` con firma inválida → 400; rutas de documentos devuelven 403 a otro usuario; el límite de `requestOtp` (Task 3) está activo en la ruta HTTP (6.ª petición → 429).
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npx vitest run` y `npx playwright test` completos en verde).
- [ ] **Step 5:** Escribir `docs/launch-checklist.md` con los bloqueos que **no** son código y deben cerrarse antes de dinero real: S.E. constituida, cuenta comercial, abogado (custodia/retención, términos de boleteras y recintos sobre reventa, Ley 81 de 2019), verificación de split/retención/payout con la pasarela elegida, implementar adaptador real de `PaymentGateway`, términos y política de privacidad publicados.
- [ ] **Step 6:** Commit `chore: hardening and launch checklist`.

---

## Autorevisión

- **Cobertura del diseño:** identidad (T3–4), publicación y duplicados (T5), pago y ledger (T6), entrega por transferencia y archivo (T7), ingreso, disputas, liberación (T8), cancelaciones (T9), pago manual (T10), panel (T11), PWA (T12), seguridad y salida (T13). Eventos solo admin, tope de precio, comisión, ventanas: Global Constraints y tareas correspondientes.
- **Llamadas del constructor nuevas, a revisar:** tope inicial 150% del valor nominal; plazo de transferencia 2 h; estado extra `liberada` entre confirmación y pago manual; `needsManualReview` para órdenes ya liquidadas al cancelar un evento.
- **Fuera de este plan:** pagos reales, adaptador de pasarela real, app nativa, alianzas con boleteras, estrategia de lanzamiento.
