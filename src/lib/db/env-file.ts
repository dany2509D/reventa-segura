/**
 * Puts a database password into the text of an env file, without the password ever being printed.
 * Finds the `DATABASE_URL=postgresql://user:...@host/db` line (active, or commented out with `#`),
 * replaces the password with its percent-encoded form and makes the line active.
 */

// user, password and the rest of the URL; the password part may be a placeholder or a real value.
const LINE = /^(\s*#?\s*)DATABASE_URL=(postgres(?:ql)?):\/\/([^:@/\s]+):[^@\s]*@(\S+)\s*$/;
const ACTIVE = /^\s*DATABASE_URL=/;

export function setDatabasePassword(envText: string, password: string): string {
  if (typeof password !== 'string' || password.trim() === '' || /[\r\n]/.test(password)) {
    throw new Error('La contraseña no puede estar vacía ni tener saltos de línea.');
  }
  const parts = envText.split(/(\r?\n)/); // keep the original line endings
  let target = -1;
  for (let i = 0; i < parts.length; i += 2) {
    if (ACTIVE.test(parts[i]) && LINE.test(parts[i])) {
      target = i;
      break;
    }
  }
  if (target < 0) {
    for (let i = 0; i < parts.length; i += 2) {
      if (LINE.test(parts[i])) {
        target = i;
        break;
      }
    }
  }
  if (target < 0) {
    throw new Error('No encontré una línea DATABASE_URL=postgresql://usuario:...@servidor/base en el archivo.');
  }
  const m = LINE.exec(parts[target])!;
  parts[target] = `DATABASE_URL=${m[2]}://${m[3]}:${encodeURIComponent(password)}@${m[4]}`;
  return parts.join('');
}
