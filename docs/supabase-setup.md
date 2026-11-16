# Base de datos en Supabase — guía paso a paso

Esta guía conecta Reventa Segura a una base de datos Postgres en Supabase. Está pensada para hacerse
una sola vez, sin experiencia previa. Si un nombre de menú no coincide exactamente con lo que ves,
busca la opción equivalente (Supabase cambia su interfaz de vez en cuando).

> **Reglas de seguridad antes de empezar**
>
> - **Nunca** pegues la contraseña de la base de datos, la cadena de conexión completa ni la
>   clave `service_role` en un chat, un issue, un correo o una captura de pantalla. Si alguna se
>   filtra, cámbiala de inmediato en Supabase.
> - Esta app **no usa** las claves `anon` / `publishable` ni `service_role` de Supabase, ni la
>   librería `supabase-js`. Solo se conecta desde el servidor con una conexión Postgres normal.
>   No copies esas claves en `.env.local` ni en Vercel.
> - Antes de guardar datos reales (usuarios, cédulas, pagos) hace falta activar Row Level Security
>   (ver el paso 7).

## 1. Crear el proyecto

1. Entra a <https://supabase.com>, crea una cuenta y luego **New project**.
2. Nombre: por ejemplo `reventa-segura`.
3. **Database password**: usa el generador de contraseñas y guárdala en tu gestor de contraseñas.
   Evita caracteres raros si puedes; si la contraseña tiene `@ # ? & /` o espacios, en la cadena de
   conexión deben ir codificados (por ejemplo `@` → `%40`, `#` → `%23`).
4. **Region**: elige **South America (São Paulo)**, la más cercana a Panamá (menor latencia).
5. Crea el proyecto y espera a que termine de prepararse.

## 2. Obtener las cadenas de conexión

1. En el panel del proyecto, pulsa el botón **Connect** (arriba).
2. Busca la sección de cadenas de conexión (*connection string*, formato URI).
3. Copia la del **Session pooler** (puerto **5432**, usuario `postgres.<referencia-del-proyecto>`,
   servidor `...pooler.supabase.com`). Es compatible con IPv4, que es lo que tienen la mayoría de
   las redes y Vercel.
   - La conexión **Direct connection** (`db.<referencia>.supabase.co`) solo funciona por IPv6 salvo
     que compres el complemento IPv4. No la necesitas.
   - El **Transaction pooler** (puerto **6543**) es opcional, útil si la app recibe mucho tráfico en
     Vercel. La app es compatible con él (no usa sentencias preparadas con nombre y cada transacción
     usa una sola conexión). Si lo usas, las migraciones deben seguir yendo por el Session pooler
     (`DATABASE_URL_MIGRATE`).
4. Reemplaza `[YOUR-PASSWORD]` por tu contraseña (codificada si tiene caracteres especiales).

## 3. Descargar el certificado de Supabase (CA)

La app **verifica el certificado** del servidor para que nadie pueda hacerse pasar por tu base de
datos. El certificado raíz de Supabase no viene incluido en Node.js, así que hay que dárselo:

1. En el panel, ve a **Database settings** (configuración de la base de datos) y busca la sección
   **SSL Configuration**.
2. Pulsa **Download certificate**. Se descarga un archivo `.crt` (texto que empieza con
   `-----BEGIN CERTIFICATE-----`).
3. En la misma sección hay una opción para **forzar SSL** en todas las conexiones: actívala.

Este certificado es público (no es un secreto), pero sí es necesario.

## 4. Configurar las variables

### En tu computadora (`.env.local`)

El archivo `.env.local` está en la carpeta del proyecto y **nunca** se sube a git. Agrega:

```bash
DATABASE_URL=postgresql://postgres.<referencia>:<contraseña>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
# Opcional: solo si DATABASE_URL usa el Transaction pooler (6543). Las migraciones van por 5432.
DATABASE_URL_MIGRATE=
# El contenido del .crt entre comillas dobles (puede ocupar varias líneas):
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----
MIID...
-----END CERTIFICATE-----"
```

- Copia el servidor y el usuario exactamente como los muestra **Connect** (el ejemplo de arriba es
  solo ilustrativo).
- `DATABASE_CA_CERT` también acepta todo en una sola línea con `\n` donde van los saltos de línea.
- No agregues `?sslmode=...` a la URL: la app configura el SSL por su cuenta (si lo agregas, se
  ignora).
- Solo para pruebas locales y si todavía no tienes el certificado, existe `DATABASE_SSL_INSECURE=1`
  (conexión cifrada **sin** verificar el certificado). En producción se ignora y la app no arranca
  sin `DATABASE_CA_CERT`.

### En Vercel

En el proyecto de Vercel: **Settings → Environment Variables**. Agrega `DATABASE_URL`,
`DATABASE_CA_CERT` (pega el contenido del `.crt` tal cual, con sus saltos de línea) y, si lo usas,
`DATABASE_URL_MIGRATE`. Márcalas como sensibles cuando Vercel lo ofrezca. **No** agregues
`DATABASE_SSL_INSECURE`.

Opcionales: `DATABASE_POOL_MAX` (conexiones por instancia, 5 por defecto) y
`DATABASE_STATEMENT_TIMEOUT_MS` (30000 por defecto; pon `0` solo si la conexión falla con un error
de *unsupported startup parameter*).

## 5. Crear las tablas y el administrador

Desde la carpeta del proyecto, en la terminal:

```bash
npm run db:migrate
```

Debe mostrar `Aplicando migraciones en postgres.<referencia>@...pooler.supabase.com:5432/postgres`
(nunca muestra la contraseña) y luego `Migraciones aplicadas.` Si dice que no hay base de datos
configurada, revisa `.env.local`.

Crear tu usuario administrador (con tu celular panameño):

```bash
npm run admin:create -- +5076XXXXXXX
```

Muestra la base de datos usada y un **secreto TOTP una sola vez**: agrégalo a tu app de
autenticación (Google Authenticator, 1Password, etc.). No lo compartas.

Opcional, solo para pruebas antes del lanzamiento (crea eventos y publicaciones de demostración;
no lo uses cuando ya haya datos reales):

```bash
npm run seed:dev
```

## 6. Revisar la conexión

```bash
npm run db:check
```

Muestra la versión del servidor, el usuario conectado, el `statement_timeout` efectivo, si existen
todas las tablas de la app, cuántos usuarios hay y si **Row Level Security** está activado en cada
tabla. No muestra secretos.

Errores comunes:

- `DATABASE_CA_CERT is required...`: falta el certificado (paso 3 y 4).
- `self-signed certificate in certificate chain` o `unable to verify`: el certificado pegado no es
  el de tu proyecto o está incompleto.
- `password authentication failed`: contraseña incorrecta o sin codificar.
- `ENOTFOUND` / `timeout`: servidor mal copiado o la red no tiene IPv4 hacia Supabase (usa el
  Session pooler).

## 7. Row Level Security (obligatorio antes de datos reales)

Supabase publica automáticamente las tablas del esquema `public` a través de su API REST (Data
API). Si RLS está desactivado en una tabla, cualquiera que tenga la clave pública `anon` del
proyecto podría leer o modificar esa tabla **sin pasar por la app**: teléfonos, documentos de
identidad, órdenes y pagos.

`npm run db:check` imprime una **ADVERTENCIA** con la lista de tablas que tienen RLS desactivado.
Antes de guardar datos reales hace falta una migración que active RLS en todas las tablas, sin
políticas (= nadie entra por la API). La app no se ve afectada porque se conecta como dueña de las
tablas (`postgres`), y los dueños no están sujetos a RLS. Esa migración está pendiente: pídela al
equipo técnico y vuelve a ejecutar `npm run db:check` hasta que no aparezca la advertencia.

Como protección adicional puedes desactivar la Data API del proyecto en la configuración de la API
de Supabase (busca la opción de *Data API* / esquemas expuestos), ya que esta app no la usa.

---

## Modo de prueba del código de ingreso

> ⚠️ **Solo para pruebas. Nunca en un sitio público.** Con este modo activo, **cualquier persona**
> que abra el sitio puede entrar como **cualquier usuario no administrador** escribiendo su número.

Mientras no haya un proveedor de SMS configurado, este modo muestra el código de ingreso **en la
pantalla** en lugar de enviarlo por SMS, para que puedas entrar desde tu celular.

### Cómo activarlo

En `.env.local` (tu computadora):

```bash
TEST_MODE_SHOW_LOGIN_CODE=1
```

Reinicia `npm run dev`. Al pedir el código en **Ingresar** aparece el aviso
"Modo de prueba: tu código es 123456" y un botón **Usar este código** que lo escribe por ti. El
código se verifica igual que uno enviado por SMS (vence en 10 minutos, máximo 5 intentos).

- Para probar desde el celular, conéctalo al mismo Wi-Fi y abre `http://<IP-de-tu-computadora>:3000`.
- En un build de producción (`next build` / Vercel) el modo **no se activa** solo con esa variable:
  además hace falta `ALLOW_TEST_LOGIN_CODES=1`. **No pongas esas dos variables en un despliegue
  público.** Si alguna vez lo haces para una prueba cerrada, quítalas inmediatamente después.
- En Vercel puede fallar de forma intermitente: el código se guarda en la memoria de una instancia
  del servidor y la consulta puede llegar a otra. Funciona de forma fiable con `npm run dev`.
- Para desactivarlo, borra la línea (o déjala vacía) y reinicia.

### Por qué los administradores están excluidos

Aunque el modo esté activo, **nunca** se muestra el código de un número con rol de administrador.
Un administrador puede aprobar identidades, resolver disputas y liberar pagos; su ingreso debe
seguir pasando por el SMS real **y** el segundo factor (TOTP). Mientras no haya proveedor de SMS,
el administrador no puede ingresar por este camino: es intencional.

### Qué no hace

- No escribe teléfonos ni códigos en los registros (logs) del servidor.
- El número se envía en el cuerpo de la petición, no en la URL, para que no quede en los registros
  de acceso.
- Limita las consultas a 10 por minuto por dirección IP.

### Antes del lanzamiento

Este modo se reemplaza por un proveedor real de SMS (por ejemplo Twilio o un proveedor panameño).
Con el proveedor configurado, deja `TEST_MODE_SHOW_LOGIN_CODE` y `ALLOW_TEST_LOGIN_CODES` vacías en
todos los entornos.
