# SEO, legal y salida a producción: lo que falta hacer fuera del código

Estado al 2026-11-19. El código ya trae: páginas legales (borrador), aviso de cookies con consentimiento, `robots.txt`, `sitemap.xml`,
etiquetas canónicas, Open Graph y Twitter Cards, datos estructurados (Organization, WebSite, FAQPage, Event), favicons, 404 y error
personalizados, redirección a una sola versión del dominio y de HTTP a HTTPS, y analítica detrás del consentimiento. Esta guía lista
lo que **solo el dueño** puede completar (datos reales, cuentas en servicios externos). Responsables: [Negocio], [Abogado], [Dev].

## 1. Variables de entorno (Vercel → Settings → Environment Variables → Production)

Ninguna es secreta. Ninguna es obligatoria para arrancar: lo que falte oculta su enlace o, en los textos legales, deja un marcador
visible `[COMPLETAR_…]`. Después de cambiar una variable hay que volver a desplegar. El detalle de cada una está en `.env.example`.

| Variable | Qué poner | Dónde se usa |
|---|---|---|
| `SITE_URL` | La dirección oficial con `https://` y **sin barra final** (por ejemplo `https://reventasegura.com`). Elige UNA versión: con o sin `www`. | Canonical, sitemap, vista previa social, redirección www ↔ dominio único |
| `BUSINESS_LEGAL_NAME`, `BUSINESS_RUC`, `BUSINESS_ADDRESS` | Razón social, RUC y dirección de la S.E. | Términos, privacidad, pie de página, datos estructurados |
| `CONTACT_EMAIL`, `CONTACT_PHONE` | Correo y teléfono de soporte | Pie de página (enlaces `mailto:` y `tel:`), textos legales, datos estructurados |
| `WHATSAPP_NUMBER` | Solo dígitos con código de país (`50761234567`) | Botón flotante de WhatsApp (sin variable, no aparece) |
| `SOCIAL_INSTAGRAM`, `SOCIAL_FACEBOOK`, `SOCIAL_X`, `SOCIAL_TIKTOK` | URL completa de la cuenta real. Vacío = sin icono | Pie de página, `sameAs` de Organization |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Solo el valor del `content` de la etiqueta que da cada buscador | Verificación de propiedad (sección 3) |
| `ANALYTICS_GA4_ID` | Identificador `G-XXXXXXXXXX` de Google Analytics 4. Vacío = sin analítica | Analítica y conversiones, solo tras aceptar cookies |

Además, las que ya existían y siguen siendo obligatorias en producción: `DATABASE_URL`, `FILE_URL_SECRET`, `CRON_SECRET`,
`BLOB_READ_WRITE_TOKEN` (ver `docs/launch-checklist.md`).

## 2. Dominio, HTTPS y una sola versión

- [ ] [Negocio] Comprar o confirmar el dominio y añadirlo en Vercel (Project → Settings → Domains). Añade **las dos versiones**
      (`ejemplo.com` y `www.ejemplo.com`): la app redirige la que no sea `SITE_URL` a la oficial con un 301.
- [ ] [Dev] **SSL automático:** Vercel emite y renueva el certificado solo, sin acción. Comprobar que el candado aparece en ambas versiones y
      que `http://` redirige a `https://`.
- [ ] [Dev] Poner `SITE_URL` (sección 1) y volver a desplegar. Comprobar en una terminal:

```powershell
curl.exe -I http://TU-DOMINIO/            # debe responder 301 hacia https
curl.exe -I https://www.TU-DOMINIO/       # debe responder 301 hacia la versión oficial
npm run check:headers -- https://TU-DOMINIO
```

- [ ] [Dev] Opcional, cuando el dominio ya sea estable: añadir `preload` al `Strict-Transport-Security` en
      `src/lib/security/headers.ts` y registrarlo en hstspreload.org. **No se puede deshacer rápido**, hacerlo al final.

## 3. Buscadores

### Google Search Console
1. Entra a <https://search.google.com/search-console> con la cuenta de Google del negocio y elige **Prefijo de URL** con la dirección oficial.
2. Método de verificación **Etiqueta HTML**: copia solo el valor de `content="…"` en `GOOGLE_SITE_VERIFICATION`, despliega y pulsa Verificar.
3. En **Sitemaps** envía `sitemap.xml`. Debe decir «Correcto».
4. En **Inspección de URLs** prueba la home y una página de evento → «Solicitar indexación».
5. Revisa «Páginas» a la semana: las privadas (`/ingresar`, `/mis-ordenes`, `/comprar/…`) deben aparecer como excluidas, y la home, los
   eventos y las páginas legales como indexadas.

### Bing Webmaster Tools
1. <https://www.bing.com/webmasters> → «Importar desde Google Search Console» (lo más rápido) o añadir el sitio a mano.
2. Si lo haces a mano: verificación por etiqueta `<meta>`, el valor va en `BING_SITE_VERIFICATION`.
3. Envía el sitemap `https://TU-DOMINIO/sitemap.xml`.

### Ficha de Google (Google Business Profile)
Solo aplica si hay un local o un servicio con dirección y atención al público; si el negocio es 100 % en línea, no hace falta (Google no
permite fichas sin ubicación o sin cobertura de servicio).
1. <https://business.google.com> → crear la ficha con el nombre exacto del negocio, categoría («Servicio de venta de entradas» o similar), dirección o
   zona de servicio y teléfono.
2. Verificar la ficha (Google envía un código por correo postal, teléfono o video).
3. Usar **los mismos** nombre, dirección y teléfono que en las variables de la sección 1: la coherencia ayuda al posicionamiento local.

### Comprobaciones de la vista previa social
- Facebook: <https://developers.facebook.com/tools/debug/> · LinkedIn: <https://www.linkedin.com/post-inspector/> · WhatsApp: pegar el enlace en un chat.
  Debe verse la tarjeta de `public/og-default.png`. Si cambias la imagen, vuelve a pasar el enlace por el depurador de Facebook para
  limpiar su caché. La imagen se regenera con `npx tsx scripts/make-brand-assets.ts`.
- Datos estructurados: <https://search.google.com/test/rich-results> con la home (FAQ) y una página de evento.

## 4. Analítica y conversiones

- [ ] [Negocio] Crear una propiedad **Google Analytics 4** y copiar el id `G-…` a `ANALYTICS_GA4_ID`. Sin él no hay analítica ni se pide permiso para ella.
- Con el id puesto, el aviso de cookies ofrece «Aceptar todas / Rechazar no esenciales / Configurar» y la etiqueta de Google **solo se carga si la
  persona acepta**; si después cambia de opinión, deja de enviar y se borran sus cookies.
- Conversiones ya marcadas en el código (`data-track`): `begin_checkout` (botón «Pagar»), `sell_cta_click` («Vender una entrada» en el inicio y el pie),
  `generate_lead` (clic en WhatsApp, correo o teléfono) y `login_start` (enviar código). En GA4 → Administrar → Eventos, marca como
  «conversión» las que te interesen.
- Para medir una acción nueva basta añadir `data-track="nombre"` a un enlace o botón y el nombre a `TRACKED_EVENTS` en `src/lib/analytics/analytics.ts`.

## 5. Textos legales: revisión del abogado

Las cuatro páginas (`/terminos`, `/privacidad`, `/cookies`, `/reembolsos`) son **texto base redactado a partir de lo que la plataforma hace hoy** (plazos,
comisión, retención del pago, datos que se guardan). **No son asesoría legal.** Antes de cobrar dinero real:

- [ ] [Abogado] Revisar y aprobar los cuatro textos completos. Al aprobarlos, en `src/app/_pages/legal.tsx` poner `LEGAL_REVIEWED = true` (quita el aviso «Texto base en revisión legal» de las páginas) y actualizar `LEGAL_UPDATED` cada vez que un texto cambie.
- [ ] [Abogado] Decidir y completar cada marcador `[COMPLETAR_…]` que quede en los textos. Los que hay hoy:
  `PASARELA_DE_PAGO`, `PROVEEDOR_DE_SMS`, `BASE_DE_TRANSFERENCIA_INTERNACIONAL`, `PLAZO_RETENCION_IDENTIDAD`, `PLAZO_RETENCION_REGISTROS`,
  `PLAZO_RESPUESTA_DERECHOS`, `AUTORIDAD_DE_PROTECCION_DE_DATOS`, `TRATAMIENTO_DE_ITBMS`, `REVISION_LEGAL_DE_LA_LIMITACION_DE_RESPONSABILIDAD`,
  `NORMATIVA_ADICIONAL_Y_JURISDICCION`, `PLAZO_DE_REEMBOLSO`, `PROCEDIMIENTO_DE_REEMBOLSO_MANUAL`, `POLITICA_DE_CAMBIO_DE_OPINION`.
  Los de razón social, RUC, dirección y correo se rellenan solos con las variables de la sección 1.
- [ ] [Abogado] Confirmar las decisiones de negocio escritas en el texto: edad mínima de 18 años, tope de responsabilidad igual al monto de la orden,
      tribunales de Panamá, y la cita a la Ley 45 de 2007 y la Ley 81 de 2019.
- [ ] [Dev] El plazo de conservación de identidad que acuerde el abogado debe coincidir con `app_config.identityRetentionDays` (hoy 365 días, provisional).
- [ ] [Dev] **Registro de la aceptación en la base de datos.** Hoy la casilla «Acepto los Términos y la Política de privacidad» del ingreso es obligatoria en
      pantalla pero **no se guarda quién aceptó ni cuándo**; solo la autorización de identidad (`consent=yes`) la exige el servidor. Para tener prueba, hay que añadir
      una columna (por ejemplo `users.terms_accepted_at` y la versión del texto) con una migración. No se hizo para no tocar la base de datos sin tu visto bueno.

## 6. Copias de seguridad y monitor de caída

- [ ] [Dev] **Backups:** Supabase → Database → Backups. Para copias diarias con recuperación a un punto en el tiempo hace falta un plan de pago.
      Probar una restauración en una rama nueva y anotar fecha y resultado en `docs/launch-checklist.md` (sección 3).
- [ ] [Dev] **Uptime:** crear un monitor gratuito (UptimeRobot, Better Stack o similar) sobre `https://TU-DOMINIO/` con aviso por correo o WhatsApp si falla 2 veces seguidas.
      Opcional: un segundo monitor sobre `https://TU-DOMINIO/robots.txt` (responde sin tocar la base de datos).
- [ ] [Dev] Alertas de logs de Vercel (ver `docs/launch-checklist.md`, sección 3).

## 7. Antes de anunciar el sitio

- [ ] Abrir en el celular y en el computador: inicio, un evento, `/privacidad`, `/terminos`, `/cookies`, `/reembolsos`, `/ingresar`, una URL inexistente (404).
- [ ] Probar el aviso de cookies: aceptar, rechazar, configurar y volver a abrirlo desde el pie. Con `ANALYTICS_GA4_ID` puesto, comprobar en la pestaña Red
      que **no** sale ninguna petición a Google Analytics hasta aceptar.
- [ ] Probar el ingreso con el número real: la casilla de términos, el código por mensaje de texto y el 2FA del administrador.
- [ ] Quitar el modo de prueba (ver `docs/launch-checklist.md`, secciones 1 y 2) y comprobar que la marca «Modo de prueba» ya no aparece.
- [ ] Restringir la clave web de Firebase (`NEXT_PUBLIC_FIREBASE_API_KEY`) en Google Cloud → APIs y servicios → Credenciales: solo el dominio oficial como origen
      permitido. La clave es pública por diseño, pero conviene limitar dónde puede usarse.
- [ ] Revisar a mano el resultado final con `npm run build` y `npm test` en limpio.
