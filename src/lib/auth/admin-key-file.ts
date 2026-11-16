import { ADMIN_TEST_KEY_MIN_LENGTH } from './admin-test-key';

/**
 * Puts TEST_MODE_ADMIN_KEY into the text of an env file (`npm run admin:code -- --init`), without
 * the key ever being printed. Never replaces a key that is already there:
 *  - absent → appended as its own line, after a comment, with the file's own line endings;
 *  - an empty placeholder (copied from .env.example) → filled in place;
 *  - a usable value → no-op;
 *  - a non-empty value that is too short, or several active lines → an error asking the owner to
 *    fix the file by hand (it was set deliberately, so it is not silently overwritten).
 * Every other line stays byte-for-byte as it was. Messages never echo a value.
 */

const NAME = 'TEST_MODE_ADMIN_KEY';
const ACTIVE = /^\s*(?:export\s+)?TEST_MODE_ADMIN_KEY\s*=(.*)$/;
// What a new key may contain: letters, digits and `._~+/=-` only, so it is safe unquoted in an env
// file (no spaces, quotes, `#` or `$` expansion) and in an HTTP header. `--init` writes 64 hex characters.
const SAFE_KEY = /^[A-Za-z0-9._~+/=-]+$/;
const COMMENT = '# Clave local para `npm run admin:code` (solo esta computadora; nunca en Vercel ni en git).';

export type AdminKeyFileResult = { status: 'added'; text: string } | { status: 'present' };

function valueOf(raw: string): string {
  const v = raw.trim();
  const quoted = /^(["'])(.*)\1$/.exec(v);
  if (quoted) return quoted[2];
  return v.replace(/\s+#.*$/, '').trim(); // unquoted: drop an inline comment
}

export function ensureAdminKeyLine(envText: string, newKey: string): AdminKeyFileResult {
  if (typeof newKey !== 'string' || newKey.length < ADMIN_TEST_KEY_MIN_LENGTH || !SAFE_KEY.test(newKey)) {
    throw new Error(`La nueva clave no es válida (mínimo ${ADMIN_TEST_KEY_MIN_LENGTH} caracteres, sin espacios ni comillas).`);
  }
  const parts = envText.split(/(\r?\n)/); // even indexes: lines; odd indexes: their line endings
  const active: number[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (ACTIVE.test(parts[i])) active.push(i);
  }

  if (active.length > 1) {
    throw new Error(`Hay más de una línea ${NAME} en .env.local: deja solo una (o bórralas todas) y vuelve a ejecutar: npm run admin:code -- --init`);
  }
  if (active.length === 1) {
    const value = valueOf(ACTIVE.exec(parts[active[0]])![1]);
    if (value.length >= ADMIN_TEST_KEY_MIN_LENGTH) return { status: 'present' };
    if (value !== '') {
      throw new Error(
        `${NAME} ya existe en .env.local pero es demasiado corta (mínimo ${ADMIN_TEST_KEY_MIN_LENGTH} caracteres). ` +
          'Borra esa línea y vuelve a ejecutar: npm run admin:code -- --init',
      );
    }
    parts[active[0]] = `${NAME}=${newKey}`;
    return { status: 'added', text: parts.join('') };
  }

  const eol = envText.includes('\r\n') ? '\r\n' : '\n';
  const lead = envText === '' || envText.endsWith('\n') ? '' : eol;
  return { status: 'added', text: `${envText}${lead}${COMMENT}${eol}${NAME}=${newKey}${eol}` };
}
