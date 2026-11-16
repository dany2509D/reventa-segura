// Usage: npm run db:set-password
// Asks for the database password with hidden input and writes it (percent-encoded) into .env.local.
// The password is never printed, never passed as an argument and never leaves this machine.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { setDatabasePassword } from '../src/lib/db/env-file';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const muted = new Writable({ write: (_c, _e, cb) => cb() });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const file = join(process.cwd(), '.env.local');
let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch {
  console.error('No existe .env.local en esta carpeta.');
  process.exit(1);
}

const first = await askHidden('Contraseña de la base de datos de Supabase (no se muestra al escribir): ');
const second = await askHidden('Repítela para confirmar: ');
if (first !== second) {
  console.error('Las dos contraseñas no coinciden. No se guardó nada.');
  process.exit(1);
}
try {
  writeFileSync(file, setDatabasePassword(text, first), 'utf8');
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
console.log('Listo: la contraseña quedó guardada en .env.local (no se muestra). Reinicia el servidor para usarla.');
process.exit(0);
