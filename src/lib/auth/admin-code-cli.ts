import { ADMIN_TEST_KEY_HEADER, ADMIN_TEST_KEY_MIN_LENGTH } from './admin-test-key';
import { normalizePanamaPhone } from './phone';

/*
 * The testable parts of scripts/admin-code.ts (`npm run admin:code`): argument parsing, the
 * this-computer-only endpoint, the request it sends and the Spanish messages it prints.
 * The key travels only to localhost / 127.0.0.1 / [::1], never through a redirect, and is never printed.
 */

export const ADMIN_CODE_USAGE = [
  'Uso:',
  '  npm run admin:code -- <celular del administrador>   muestra su código de ingreso (solo en esta computadora)',
  '  npm run admin:code -- --init                         crea TEST_MODE_ADMIN_KEY en .env.local (una sola vez)',
  'Opción: --url http://localhost:PUERTO  (por defecto http://localhost:3000, o el puerto de la variable PORT)',
].join('\n');

export const NO_RECENT_CODE_MESSAGE =
  'No hay un código reciente: pide el código en la pantalla de ingreso primero y vuelve a ejecutar esto';

export type AdminCodeArgs =
  | { kind: 'init' }
  | { kind: 'code'; phone: string; url?: string }
  | { kind: 'usage'; error?: string };

export function parseAdminCodeArgs(argv: readonly string[]): AdminCodeArgs {
  const positional: string[] = [];
  let url: string | undefined;
  let init = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { kind: 'usage' };
    if (arg === '--init') {
      init = true;
    } else if (arg === '--url' || arg.startsWith('--url=')) {
      const value = arg === '--url' ? argv[++i] : arg.slice('--url='.length);
      if (!value) return { kind: 'usage', error: 'Falta la dirección después de --url.' };
      if (url !== undefined) return { kind: 'usage', error: 'Indica --url una sola vez.' };
      url = value;
    } else if (arg.startsWith('-')) {
      return { kind: 'usage', error: `Opción desconocida: ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  if (init) {
    if (positional.length || url !== undefined) return { kind: 'usage', error: '--init no lleva número ni --url.' };
    return { kind: 'init' };
  }
  if (!positional.length) return { kind: 'usage', error: 'Falta el número de celular del administrador.' };
  const phone = normalizePanamaPhone(positional.join(' '));
  if (!phone) return { kind: 'usage', error: 'Número no válido: usa un celular panameño, por ejemplo +50761234567.' };
  return url === undefined ? { kind: 'code', phone } : { kind: 'code', phone, url };
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** This computer only: the exact loopback names, never a LAN address, 0.0.0.0 or a look-alike. */
export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

const NOT_LOCAL =
  'Por seguridad la clave solo se envía a esta computadora: usa --url http://localhost:PUERTO ' +
  '(también vale 127.0.0.1 o [::1]), nunca la IP de la red ni un dominio.';

function assertLocal(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(NOT_LOCAL);
  if (url.username || url.password) throw new Error(NOT_LOCAL);
  if (!isLocalHostname(url.hostname)) throw new Error(NOT_LOCAL);
}

/** The test-code endpoint on this computer: --url (its origin only), else http://localhost:PORT (3000). */
export function resolveTestCodeEndpoint(opts: { url?: string; port?: string }): URL {
  let base: URL;
  if (opts.url !== undefined) {
    try {
      base = new URL(opts.url);
    } catch {
      throw new Error(`La dirección de --url no es válida. ${NOT_LOCAL}`);
    }
  } else {
    const port = opts.port || '3000';
    const n = Number(port);
    if (!/^\d{1,5}$/.test(port) || n < 1 || n > 65535) {
      throw new Error('La variable PORT no es un puerto válido (1-65535). Corrígela o usa --url http://localhost:PUERTO.');
    }
    base = new URL(`http://localhost:${n}`);
  }
  assertLocal(base);
  return new URL('/api/auth/test-code', base.origin);
}

/** Why the key cannot be used, or null. Never echoes the key. */
export function adminKeyProblem(key: string | undefined): string | null {
  if (!key) {
    return [
      'Falta TEST_MODE_ADMIN_KEY en .env.local. Créala una sola vez con:',
      '  npm run admin:code -- --init',
      'y luego reinicia el servidor de desarrollo (detén npm run dev con Ctrl+C y vuelve a ejecutarlo).',
    ].join('\n');
  }
  if (key.length < ADMIN_TEST_KEY_MIN_LENGTH || !/^[\x21-\x7e]+$/.test(key) || key.includes('$')) {
    return (
      `TEST_MODE_ADMIN_KEY en .env.local no sirve (mínimo ${ADMIN_TEST_KEY_MIN_LENGTH} caracteres, sin espacios, ` +
      'acentos ni $). Borra esa línea, ejecuta npm run admin:code -- --init y reinicia el servidor de desarrollo.'
    );
  }
  return null;
}

/** The fetch options: JSON { phone } in the body, the key header, a same-origin Origin, no redirects. */
export function buildTestCodeRequest(endpoint: URL, phone: string, key: string): RequestInit {
  assertLocal(endpoint);
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: endpoint.origin,
      [ADMIN_TEST_KEY_HEADER]: key,
    },
    body: JSON.stringify({ phone }),
    // A redirect could carry the key header to another host: fail instead of following it.
    redirect: 'error',
    cache: 'no-store',
  };
}

export type TestCodeOutcome = { ok: true; code: string } | { ok: false; message: string };

export function interpretTestCodeResponse(status: number, body: unknown, retryAfter: string | null): TestCodeOutcome {
  if (status === 200) {
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && /^\d{6}$/.test(code)) return { ok: true, code };
    return { ok: false, message: 'Respuesta inesperada del servidor (HTTP 200 sin código).' };
  }
  if (status === 404) {
    // The server answers the same empty 404 for every refusal, on purpose: list the usual causes.
    return {
      ok: false,
      message: [
        `${NO_RECENT_CODE_MESSAGE}.`,
        'Si ya lo pediste hace menos de 10 minutos, revisa que:',
        '  - .env.local tenga TEST_MODE_SHOW_LOGIN_CODE=1 y la clave creada con npm run admin:code -- --init;',
        '  - reiniciaste el servidor de desarrollo después de cambiar .env.local;',
        '  - sea el servidor de desarrollo (npm run dev): un build de producción nunca muestra el código de un administrador;',
        '  - el número sea exactamente el del administrador.',
      ].join('\n'),
    };
  }
  if (status === 429) {
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? `${retryAfter} segundos` : 'un minuto';
    return { ok: false, message: `Demasiados intentos (HTTP 429). Espera ${wait} y vuelve a intentar.` };
  }
  if (status >= 500) {
    return { ok: false, message: `El servidor respondió con un error (HTTP ${status}). Revisa la terminal donde corre npm run dev.` };
  }
  return { ok: false, message: `Respuesta inesperada del servidor (HTTP ${status}). ¿Es la dirección del servidor de desarrollo?` };
}

/** A Spanish explanation of a failed fetch (server off, timeout, redirect…). Never echoes the key. */
export function describeFetchFailure(error: unknown, origin: string): string {
  const e = error as { name?: string; cause?: { code?: string } } | null;
  if (e?.cause?.code === 'ECONNREFUSED') {
    return `No hay un servidor encendido en ${origin}. Enciéndelo con npm run dev en otra terminal (o indica el puerto con --url http://localhost:PUERTO).`;
  }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return `El servidor de ${origin} no respondió a tiempo. Si acaba de arrancar, espera a que termine de compilar y vuelve a intentar.`;
  }
  return `No se pudo conectar con ${origin} (¿está encendido npm run dev?). Si el servidor respondió con una redirección, no se sigue por seguridad.`;
}
