# Reventa Segura (nombre provisional) — Diseño

Fecha: 2026-11-15 · Mercado: Panamá · Estado: borrador para aprobación

## 1. Intención y por qué

Marketplace de reventa de entradas para todo tipo de eventos en Panamá. Hoy, cuando un evento se agota, cientos de personas compran y revenden en los comentarios de las promotoras (Instagram, Facebook, WhatsApp) sin ninguna garantía, y es común que estafen al comprador. El valor del producto no es "vender entradas": es **confianza en la transacción**. Entrada verificada, plata que no llega al vendedor hasta que el comprador entra al evento.

## 2. Objetivos, no-objetivos, anti-objetivos

**Objetivos (v1)**
- Un vendedor publica una entrada y esta queda verificada contra duplicados.
- Un comprador paga por Yappy o tarjeta y su pago queda protegido hasta el evento.
- El comprador confirma su ingreso y el vendedor cobra. Si hay problema, hay disputa con resolución manual.
- Funcionar en celular, sin instalar nada desde una tienda de apps.

**No-objetivos (v1)**
- Vender entradas primarias (no somos boletera).
- App nativa en tiendas (viene después, reutilizando el backend).
- Integraciones con boleteras/promotoras (se suman evento por evento más adelante).
- Otros países.

**Anti-objetivos (sería un fracaso aunque "funcione")**
- Que se venda dos veces la misma entrada.
- Que el vendedor cobre sin que el comprador haya entrado, o que el comprador pierda plata por una entrada falsa.
- Que la plataforma "tenga" plata de terceros sin cobertura legal/financiera adecuada.
- Que sirva para fomentar especulación abusiva sin ningún control (ver tope de precio, sección 6).

## 3. Restricciones

- Mercado panameño: pagos con Yappy y tarjetas locales/internacionales. Pasarelas candidatas: Tilopay, PagueloFacil (y Yappy comercial). No está confirmado que permitan dividir pagos ni retener fondos: hay que verificarlo con su documentación o con ellos.
- Sin alianzas con boleteras/promotoras al inicio. La verificación debe funcionar sin su cooperación.
- La empresa está en trámite como Sociedad de Emprendimiento (S.E.). Sin empresa constituida y cuenta comercial no se pueden abrir cuentas con pasarelas: se desarrolla con pagos de prueba.
- Retener fondos de terceros puede requerir licencia, fideicomiso o estructura bancaria. **Pendiente de abogado antes de cobrar dinero real.**
- Uso principal desde celular.

## 4. Enfoques considerados

1. **PWA (web móvil instalable).** Una base de código, sin tiendas de apps, semanas para lanzar. Cámara y geolocalización funcionan en el navegador. Push débil, sobre todo en iPhone.
2. **App nativa (React Native).** Mejor experiencia y notificaciones. Más costo y la revisión de tiendas frena la iteración.
3. **PWA primero, app después (ELEGIDO por el usuario).** Se valida el flujo con la PWA y el backend se reutiliza para una app nativa.

Sobre cómo se confirma el ingreso: (1) alianza con boleteras, (2) confirmación propia, (3) mixto. **Elegido: 3.** Se arranca con confirmación propia y se agregan alianzas por evento.

## 5. Decisiones del usuario

- Reventa para todo tipo de eventos.
- Verificación y confirmación de ingreso: camino mixto, arrancando sin contactos.
- PWA primero, app nativa después.
- Dinero: cobrar con pasarela licenciada, liquidar al vendedor con retraso programado; la plataforma no "guarda" la plata.

## 6. Diseño propuesto (mis llamadas, a corregir)

**Stack:** Next.js (App Router) + Postgres, desplegado en Vercel; base de datos vía Marketplace de Vercel (p. ej. Neon). Autenticación por número de celular (código por SMS/WhatsApp), porque en Panamá el celular es la identidad natural. Almacenamiento privado de imágenes de entradas (Vercel Blob privado).

**Módulos**
1. **Identidad:** registro con celular, verificación de cédula/pasaporte y selfie antes de vender (reduce estafadores). Compradores con verificación liviana.
2. **Publicación y verificación de entradas:** el vendedor sube la entrada (QR/PDF/captura). Se extrae y guarda una huella del código (hash) para detectar duplicados. Estados: pendiente, verificada, rechazada. Revisión manual en v1 cuando la huella no sea concluyente. Verificación contra boletera queda como mejora futura.
3. **Catálogo de eventos:** eventos con fecha, lugar y coordenadas (para geolocalización).
4. **Compra y pago:** adaptador de pasarela intercambiable. Pago por Yappy y tarjeta. Comisión de la plataforma sobre el precio.
5. **Libro contable (ledger) y máquina de estados por transacción:** `creada → pagada → entrada_entregada → ingreso_confirmado → liquidada`, con ramas `disputada → reembolsada | liquidada`. Cada movimiento queda registrado e inmutable; sirve para disputas y auditoría.
6. **Confirmación de ingreso:** el comprador confirma en la app durante el evento (geolocalización dentro del radio del lugar + foto del escaneo). Si nadie disputa dentro de una ventana (p. ej. 12–24 h desde el inicio), se liquida automáticamente.
7. **Disputas:** el comprador abre una disputa con evidencia; un operador la resuelve manualmente en v1 (panel de administración simple).
8. **Liquidación al vendedor:** payout programado tras confirmación/vencimiento de la ventana (método a definir según lo que permita la pasarela y el banco).
9. **Controles anti-abuso:** tope de sobreprecio configurable (p. ej. un % sobre el valor nominal), límites de entradas por usuario, bloqueo de cuentas con disputas repetidas.
10. **Panel de administración:** revisión de entradas, disputas, usuarios, configuración de reglas.

**Datos clave:** usuarios, eventos, entradas (con huella única), órdenes, asientos del ledger, pagos, liquidaciones, disputas, confirmaciones de ingreso.

**Seguridad y privacidad:** datos de pago nunca pasan por nuestros servidores (redirección/hosted checkout de la pasarela); documentos de identidad en almacenamiento privado, acceso restringido y auditado; cumplimiento de la ley panameña de protección de datos personales (Ley 81 de 2019), por confirmar con abogado.

## 7. Qué queda para el constructor

- Elegir pasarela concreta tras verificar split/retención/payout y comisiones.
- Esquema exacto de la base de datos y de los estados.
- Algoritmo concreto de huella/detección de duplicados por tipo de entrada (QR, PDF, captura).
- Ventana de disputa y porcentaje de comisión exactos (valores iniciales propuestos, ajustables).
- Proveedor de SMS/WhatsApp para el código de acceso.
- Orden de entrega por fases (sugerido: identidad + eventos → publicar/verificar → pago de prueba y ledger → confirmación y disputas → panel admin → pagos reales tras abogado y empresa).

## 8. Riesgos abiertos

- **Legal:** custodia/retención de fondos, figura de la S.E., protección de datos, reventa de boletos. Requiere abogado antes de dinero real.
- **Verificación débil sin alianzas:** un vendedor puede subir una entrada ya usada o vendida en otro canal. Mitigación: huella propia, verificación de identidad, liquidación retrasada, disputas.
- **Confirmación por geolocalización:** manipulable. Mitigación: foto del escaneo + retraso + historial de disputas.
- **Arranque en frío del marketplace:** sin oferta y demanda no hay producto. Estrategia de lanzamiento por evento o nicho a definir aparte.

## 9. Decisiones tras la revisión del constructor

**Decidido por el usuario**
- **Flujo del dinero (v1):** se cobra a la cuenta de la empresa mediante pasarela y el pago al vendedor se hace por transferencia manual después de la confirmación o vencimiento de la ventana. El pago al vendedor queda detrás de un adaptador para migrar luego a fideicomiso/estructura bancaria o a payout de pasarela sin reescribir. Sigue pendiente la consulta con abogado antes de mover dinero real.

**Llamadas mías, aprobadas por el usuario**
- Alcance del plan: hasta producción-lista con pagos de prueba. Pagos reales = fase aparte, condicionada a abogado y empresa constituida.
- Ledger: registro de eventos con saldos derivados; sin custodia. Al vendedor se le muestra "pendiente de liberar" solo informativo.
- Eventos: solo los crea el administrador en v1.
- Operadores: el fundador, con revisión manual de entradas, cédula y disputas. Sin proveedor externo de verificación de identidad en v1.
- Comisión: 10% al vendedor, configurable. Tope de sobreprecio: valor configurable, el valor nominal lo ingresa el administrador al crear el evento.
- Ventana de confirmación y disputa: hasta 12 h después del inicio del evento. Sin disputa, se libera. Si niegan el ingreso, se abre disputa.
- Cancelaciones: evento cancelado = reembolso total. El comprador no cancela tras pagar. El vendedor puede retirar su publicación antes de una venta.
- Tipos de evento: entrada general y numerada se tratan igual en v1; pases multi-día después.
- Idioma y escala: solo español, tráfico moderado.
- Geolocalización: señal de apoyo, no bloqueo; la foto del escaneo y el historial pesan igual.

**Entrega de la entrada (flujo real descrito por el usuario)**
Hoy el boleto le llega al titular por correo y también queda en la app/página de la boletera (Panatickets y Ticketplus). Hoy el comprador paga antes de recibir; ese es el hueco que cubre la plataforma. Investigación: la ficha de la app de Ticketplus Panamá indica que permite transferir boletos a otra persona; no se encontró confirmación sobre Panatickets ni sobre las políticas de reventa de ninguna de las dos. Al menos un recinto panameño (Autódromo) prohíbe la reventa en sus términos.

Diseño de entrega (mi propuesta, a validar con el usuario):
- **Vía principal: transferencia dentro de la boletera.** Tras el pago, el vendedor tiene un plazo (p. ej. 2 h, o antes del evento) para transferir la entrada al correo/cuenta del comprador en la boletera. El comprador la ve en su app de la boletera y confirma "recibida" subiendo una captura. Estados: `pagada → transferencia_pendiente → entrada_recibida → ingreso_confirmado`. Si vence el plazo sin transferencia, reembolso automático.
- **Vía de respaldo: archivo (captura/PDF/QR)** para boletas o eventos donde no exista transferencia, con marca de agua con el usuario del comprador, visible solo tras el pago.
- Ventaja de la transferencia: la entrada queda realmente a nombre del comprador en la boletera, por lo que el QR deja de servir al vendedor. Esto debilita el fraude de doble venta mejor que cualquier huella nuestra.
- La huella anti-duplicados sigue aplicando a entradas por archivo y a publicaciones repetidas dentro de la plataforma.
- Se verifica la publicación pidiendo al vendedor la captura del boleto en su cuenta de la boletera (con su nombre) y se coteja con su identidad.

**Riesgos nuevos**
- **Términos de las boleteras/recintos:** pueden prohibir la reventa o anular boletos revendidos. Un comprador podría llegar y ser rechazado aunque la entrada "sea válida". Hay que revisarlo con abogado y, a futuro, buscar un acuerdo. En la UI se debe avisar claramente cuando el evento prohíba la reventa o la transferencia.
- Si la boletera permite recuperar o anular una transferencia, el vendedor podría revertirla. El cobro de disputas lo cubre en v1.
