// Usage: npm run admin:code -- <admin phone>   (e.g. +50761234567)
//        npm run admin:code -- --init           (creates TEST_MODE_ADMIN_KEY in .env.local, once)
// Login-code TEST MODE only, on the owner's development computer: asks the local dev server for the
// ADMIN's login code, proving "this computer" with the TEST_MODE_ADMIN_KEY secret from .env.local
// (see src/lib/auth/admin-test-key.ts). The admin still needs the TOTP code afterwards.
// The key is sent only to localhost / 127.0.0.1 / [::1] and is never printed.
import './load-env';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_CODE_USAGE,
  adminKeyProblem,
  buildTestCodeRequest,
  describeFetchFailure,
  interpretTestCodeResponse,
  parseAdminCodeArgs,
  resolveTestCodeEndpoint,
} from '../src/lib/auth/admin-code-cli';
import { ensureAdminKeyLine, type AdminKeyFileResult } from '../src/lib/auth/admin-key-file';

const args = parseAdminCodeArgs(process.argv.slice(2));

if (args.kind === 'usage') {
  if (args.error) console.error(`${args.error}\n`);
  console.error(ADMIN_CODE_USAGE);
  process.exit(args.error ? 1 : 0);
}

if (args.kind === 'init') {
  const file = join(process.cwd(), '.env.local');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  let result: AdminKeyFileResult;
  try {
    result = ensureAdminKeyLine(text, randomBytes(32).toString('hex'));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  if (result.status === 'present') {
    console.log('TEST_MODE_ADMIN_KEY ya existe en .env.local: no se cambió nada.');
    process.exit(0);
  }
  writeFileSync(file, result.text, { encoding: 'utf8', mode: 0o600 });
  console.log('Listo: TEST_MODE_ADMIN_KEY quedó guardada en .env.local (no se muestra; no la compartas).');
  console.log('Reinicia el servidor de desarrollo una vez (Ctrl+C en la terminal de npm run dev y vuelve a ejecutarlo).');
  process.exit(0);
}

const key = process.env.TEST_MODE_ADMIN_KEY;
const problem = adminKeyProblem(key);
if (problem) {
  console.error(problem);
  process.exit(1);
}

let endpoint: URL;
try {
  endpoint = resolveTestCodeEndpoint({ url: args.url, port: process.env.PORT });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

let res: Response;
try {
  // Generous timeout: on first use the dev server compiles the route before answering.
  res = await fetch(endpoint, { ...buildTestCodeRequest(endpoint, args.phone, key!), signal: AbortSignal.timeout(120_000) });
} catch (e) {
  console.error(describeFetchFailure(e, endpoint.origin));
  process.exit(1);
}

const body = await res.json().catch(() => null);
const outcome = interpretTestCodeResponse(res.status, body, res.headers.get('retry-after'));
if (!outcome.ok) {
  console.error(outcome.message);
  process.exit(1);
}
console.log(`Código de ingreso: ${outcome.code}`);
console.log('Escríbelo en la pantalla de ingreso y después el código de tu app de autenticación (TOTP). Vence en 10 minutos.');
process.exit(0);
