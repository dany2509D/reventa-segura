# Reventa Segura v1 — Requisitos

Complementa `2026-11-15-reventa-segura-design.md`. Los valores marcados **(propuesta)** son míos y se pueden cambiar. Cada requisito indica la tarea del plan que lo implementa (T1–T13).

## 1. Requisitos funcionales (RF)

**Cuentas e identidad**
- RF-01 El usuario se registra e ingresa con su celular panameño y un código de un solo uso. (T3)
- RF-02 Para vender, el usuario sube cédula/pasaporte y selfie; un administrador los aprueba o rechaza. Comprar solo exige celular verificado. (T4)
- RF-03 Roles: `user` y `admin`. Solo `admin` accede al panel. (T4, T11)

**Eventos**
- RF-04 El administrador crea eventos con nombre, recinto, coordenadas, radio, fecha de inicio, valor nominal, si permite transferencia y si prohíbe la reventa. (T4)
- RF-05 El administrador puede cancelar un evento; eso reembolsa todas las órdenes. (T9)
- RF-06 El visitante puede ver eventos y publicaciones sin iniciar sesión; para comprar debe ingresar. (T12)

**Publicación**
- RF-07 El vendedor aprobado publica una entrada con precio, modo de entrega (transferencia o archivo) y captura de prueba. (T5)
- RF-08 El sistema rechaza publicaciones duplicadas, con precio sobre el tope, de eventos cerrados o que prohíben la reventa. (T5)
- RF-09 Un administrador verifica o rechaza cada publicación. (T5, T11)
- RF-10 El vendedor puede retirar una publicación mientras no esté vendida. (T5)

**Compra y entrega**
- RF-11 El comprador paga con checkout alojado de la pasarela (Yappy y tarjetas). Solo un comprador puede obtener cada publicación. (T6)
- RF-12 Modo transferencia: el vendedor transfiere la entrada en la boletera dentro del plazo; el comprador confirma la recepción con una captura. Si el plazo vence, reembolso automático. (T7, T8)
- RF-13 Modo archivo: el comprador ve el archivo con marca de agua solo tras pagar. (T7)

**Ingreso, disputas y liberación**
- RF-14 El día del evento el comprador confirma su ingreso con ubicación y foto. (T8)
- RF-15 El comprador puede abrir una disputa hasta 12 h después del inicio del evento. El administrador la resuelve: reembolso o liberación. (T8, T11)
- RF-16 Sin disputa, al cerrar la ventana el dinero queda liberado para el vendedor. (T8)
- RF-17 La liquidación al vendedor es una transferencia manual que el administrador registra con su referencia bancaria. (T10)

**Información y administración**
- RF-18 El usuario ve el historial de sus órdenes con estado y cuenta regresiva de plazos. El vendedor ve "pendiente de liberar". (T12)
- RF-19 El administrador ve colas de publicaciones, identidades, disputas y pagos; puede configurar comisión y tope. (T11)
- RF-20 Cada acción del administrador y cada cambio de estado de una orden quedan registrados (quién, cuándo, qué). (T6, T11)
- RF-21 La interfaz avisa de forma visible cuando un evento prohíbe o limita la reventa. (T12)

## 2. Requisitos no funcionales (RNF)

- RNF-01 **Disponibilidad (propuesta):** 99,5 % mensual, sin ventana de mantenimiento durante eventos grandes. Dependemos de Vercel y de la base de datos administrada.
- RNF-02 **Rendimiento (propuesta):** página de evento con LCP ≤ 2,5 s en 4G; respuestas de API ≤ 500 ms en el percentil 95; soportar 200 usuarios simultáneos en un pico de venta.
- RNF-03 **Móvil primero:** funciona desde 360 px de ancho, sin scroll horizontal, con objetivos táctiles ≥ 44 px. Navegadores: Chrome y Safari de los últimos 2 años.
- RNF-04 **Instalable:** manifiesto y service worker para añadir a la pantalla de inicio. Sin modo offline completo; sin conexión se muestra una pantalla clara de reintento.
- RNF-05 **Integridad financiera:** ningún cambio de estado ni asiento contable se pierde o se duplica ante reintentos, concurrencia o caídas a mitad de operación. Los webhooks son idempotentes.
- RNF-06 **Auditabilidad:** el ledger es solo-agregar y se conserva al menos 5 años (propuesta; confirmar con el abogado).
- RNF-07 **Idioma y formato:** solo español; dinero en USD con dos decimales; fechas en hora de Panamá (UTC−5).
- RNF-08 **Accesibilidad:** contraste AA, etiquetas en formularios, navegación por teclado en el panel.
- RNF-09 **Mantenibilidad:** TypeScript estricto, cobertura de pruebas ≥ 90 % en `src/lib`, reglas de negocio aisladas de la UI.
- RNF-10 **Observabilidad:** registros estructurados sin datos personales, alertas cuando falla un webhook, una liberación o un reembolso.
- RNF-11 **Recuperación (propuesta):** copias de seguridad diarias de la base de datos, restauración probada antes de salir a producción; objetivo de pérdida máxima 24 h.
- RNF-12 **Costos:** gasto de SMS/WhatsApp con tope mensual y alerta (ver SEG-07).

## 3. Delimitantes (alcance y restricciones)

**Dentro del alcance (v1)**
- DEL-01 Solo Panamá, solo USD, solo español.
- DEL-02 Reventa entre particulares de entradas ya compradas en Panatickets, Ticketplus u otras. No vendemos entradas primarias.
- DEL-03 Verificación sin alianzas: transferencia dentro de la boletera como vía principal, archivo con marca de agua como respaldo.
- DEL-04 Todo evento lo crea el administrador. Entrada general y numerada se tratan igual.
- DEL-05 Disputas y verificación de identidad manuales, a cargo del fundador.

**Fuera del alcance (v1)**
- DEL-06 Cobros reales, hasta tener S.E. constituida, cuenta comercial y visto bueno del abogado.
- DEL-07 App nativa, notificaciones push, pagos con criptomonedas, otros países o monedas.
- DEL-08 Pases de varios días, reventas encadenadas (comprar para revender dentro de la plataforma) y subastas.
- DEL-09 Integraciones técnicas con boleteras o promotoras.
- DEL-10 Verificación de identidad con proveedor externo, chat entre usuarios y calificaciones.

**Restricciones externas**
- DEL-11 La plataforma no custodia dinero: cobra con una pasarela licenciada y paga al vendedor por transferencia manual detrás de un adaptador.
- DEL-12 No está confirmado que la pasarela permita dividir o retener fondos; el diseño no depende de eso.
- DEL-13 Las boleteras o recintos pueden prohibir la reventa o anular entradas revendidas; la plataforma no puede garantizar el ingreso, solo el reembolso por disputa.
- DEL-14 Debe cumplir la Ley 81 de 2019 de protección de datos personales (a confirmar con el abogado).
- DEL-15 Operador único al inicio: los volúmenes de revisión manual deben ser abordables para una persona.

## 4. Seguridad de la PWA

### 4.1 Amenazas principales y respuesta

| Amenaza | Qué podría pasar | Control |
|---|---|---|
| Vendedor falso o entrada ya usada | Cobra y el comprador no entra | Identidad aprobada, transferencia en boletera, ventana de disputa, liquidación diferida (T4–T8) |
| Doble venta de la misma entrada | Dos compradores pagan por una | Huella de QR, índice único, bloqueo de fila al comprar (T5, T6) |
| Robo de cuenta | Alguien se hace pasar por un usuario | OTP corto con expiración, sesión revocable, aviso de nuevo dispositivo (propuesta) |
| Abuso del SMS | Costo disparado por envíos masivos | Límites por teléfono/IP/día, tope de gasto, CAPTCHA tras fallos |
| Acceso a datos ajenos (IDOR) | Ver órdenes, cédulas o entradas de otros | Autorización por recurso en cada ruta y prueba automática por ruta |
| Archivos maliciosos | Subir ejecutables o imágenes bomba | Lista blanca de tipo, tamaño máximo, reprocesar con `sharp` y descartar metadatos |
| Webhook falso | Marcar pagos como hechos sin pagar | Firma verificada y comparación de monto/orden contra la base de datos |
| Fraude interno o error del operador | Pagar de más o liberar mal | Registro de auditoría, doble confirmación en payouts, 2FA de administrador |
| Fuga de documentos de identidad | Daño legal y de reputación | Blob privado, URL firmada de 60 s, acceso auditado, borrado tras retención |

### 4.2 Requisitos de seguridad (SEG)

**Autenticación y sesión**
- SEG-01 OTP de 6 dígitos, válido 10 min, un solo uso, guardado como hash con sal, máximo 5 intentos por código.
- SEG-02 Sesión en cookie `httpOnly`, `Secure`, `SameSite=Lax`; token guardado como hash en la base. Nunca en `localStorage`.
- SEG-03 Expiración de sesión de 30 días de usuario y 8 horas de administrador; cierre de sesión revoca el token.
- SEG-04 Los administradores usan un segundo factor adicional al celular (app TOTP o llave) **(propuesta)**.

**Autorización**
- SEG-05 Toda ruta y acción verifica sesión y propiedad del recurso en el servidor; la UI no es un control de seguridad.
- SEG-06 Pruebas automáticas que recorren cada ruta con usuario ajeno, anónimo y admin.

**Abuso y límites**
- SEG-07 Límites de tasa en OTP, login, publicación, compra, disputas y subida de archivos; tope de gasto de SMS diario con alerta.
- SEG-08 Límites de negocio: máximo de entradas activas por vendedor, bloqueo de cuentas con disputas repetidas.

**Archivos y datos**
- SEG-09 Subidas solo JPEG/PNG/WebP/PDF, máximo 8 MB, validadas por contenido y no por extensión; metadatos EXIF eliminados.
- SEG-10 Documentos de identidad y capturas en almacenamiento privado; acceso por URL firmada de 60 s y registrado.
- SEG-11 Datos sensibles (cédula, selfie) se eliminan o anonimizan al terminar el período de retención definido con el abogado.
- SEG-12 Registros y errores no incluyen teléfono, cédula ni tokens completos.

**Pagos**
- SEG-13 Nunca se reciben ni almacenan datos de tarjeta o Yappy; solo referencias del proveedor.
- SEG-14 Cada webhook se valida por firma, se compara con la orden y su monto, y se procesa una sola vez.
- SEG-15 Los secretos viven en variables de entorno de Vercel, nunca en el repositorio; rotación documentada.

**Navegador y PWA**
- SEG-16 Solo HTTPS con HSTS; cabeceras `Content-Security-Policy` estricta, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, `Permissions-Policy` limitada a cámara y geolocalización.
- SEG-17 Protección contra CSRF en acciones que cambian estado (token o verificación de origen) y escape de todo texto de usuario contra XSS.
- SEG-18 El service worker solo guarda en caché la estructura estática; nunca respuestas de API, entradas, documentos ni datos de usuario.
- SEG-19 Los permisos de cámara y ubicación se piden solo en el momento de usarlos, con explicación en español; la app funciona si el usuario los niega (la ubicación es solo una señal).
- SEG-20 Las capturas y entradas mostradas al comprador llevan marca de agua con su identificador para disuadir la filtración.

**Operación**
- SEG-21 Registro de auditoría inmutable de acciones de administrador y cambios de estado de órdenes.
- SEG-22 Revisión de dependencias en cada cambio (`npm audit`) y actualizaciones de seguridad mensuales.
- SEG-23 Antes de producción: revisión de seguridad independiente de la rama completa y prueba de restauración de copias.

## 5. Impacto en el plan

El plan actual cubre la mayoría. Estos requisitos añaden trabajo que **todavía no está en el plan** y propongo sumar:

1. **Auditoría (SEG-21/RF-20):** tabla `audit_log` solo-agregar y función `audit()` usada por T6, T8, T10, T11 (T1 y T11).
2. **2FA de administrador (SEG-04):** TOTP en T3/T11.
3. **Validación de archivos (SEG-09/SEG-10):** módulo `uploads` con lista blanca, límite, reprocesado y URL firmada (T4/T5).
4. **Límites de tasa generales (SEG-07/08):** módulo `rate-limit` usado en todas las rutas de escritura (T13, con base en T3).
5. **CSP, CSRF y cabeceras completas (SEG-16/17):** ampliar T13.
6. **Prueba automática de autorización por ruta (SEG-06):** nueva prueba en T13.
7. **Retención y borrado de datos sensibles (SEG-11):** tarea de limpieza en el mantenimiento (T8) cuando el abogado defina plazos.
8. **Observabilidad y alertas (RNF-10):** logging estructurado y alertas en fallos de webhook/liberación (T13).
