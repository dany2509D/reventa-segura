import { ValidationError } from '@/lib/errors';
import type { NewEvent } from '@/lib/events/events';

const bad = (path: string, message: string) => new ValidationError('Invalid input', [{ path, message }]);

const MAX_USD_CENTS = 2_147_483_647;

/** "25", "25.5", "25.50", "1,250.00" → integer cents. Only positive amounts with ≤ 2 decimals. */
export function usdToCents(input: string): number {
  const s = (input ?? '').trim().replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw bad('amount', 'Monto inválido');
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  if (cents <= 0 || cents > MAX_USD_CENTS) throw bad('amount', 'Monto fuera de rango');
  return cents;
}

/** `<input type="datetime-local">` value (no zone) read as Panama time, UTC−5 all year. */
export function panamaLocalToDate(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((input ?? '').trim());
  if (!m) throw bad('startsAt', 'Fecha inválida');
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h + 5, mi));
  // Date.UTC rolls 2027-13-40 over silently: round-trip to be sure the parts survived.
  const back = new Date(date.getTime() - 5 * 3_600_000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi) {
    throw bad('startsAt', 'Fecha inválida');
  }
  return date;
}

function num(fd: FormData, key: string, integer = false): number {
  const raw = fd.get(key);
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!/^-?\d+(\.\d+)?$/.test(s) || (integer && !/^-?\d+$/.test(s))) throw bad(key, 'Número inválido');
  return Number(s);
}

const text = (fd: FormData, key: string): string => {
  const raw = fd.get(key);
  return typeof raw === 'string' ? raw.trim() : '';
};

/** The admin "new event" form → input for createEvent (which does the final validation). */
export function parseEventForm(fd: FormData): NewEvent {
  return {
    name: text(fd, 'name'),
    venue: text(fd, 'venue'),
    lat: num(fd, 'lat'),
    lng: num(fd, 'lng'),
    radiusM: num(fd, 'radiusM', true),
    startsAt: panamaLocalToDate(text(fd, 'startsAt')),
    faceValueCents: usdToCents(text(fd, 'faceValue')),
    allowsTransfer: fd.get('allowsTransfer') === 'on',
    resaleProhibited: fd.get('resaleProhibited') === 'on',
  };
}
