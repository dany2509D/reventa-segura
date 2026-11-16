// Display parts of an instant in Panama time (UTC−5, no daylight saving), for date blocks and
// labels. Fixed arithmetic and fixed Spanish names instead of Intl: the server and every browser
// produce exactly the same text (no hydration mismatch, no dependency on the runtime's locale data).

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export type DateParts = {
  /** "05" */
  day: string;
  /** "nov" */
  month: string;
  /** "noviembre" */
  monthLong: string;
  /** "sáb" */
  weekday: string;
  /** "sábado" */
  weekdayLong: string;
  /** "2026" */
  year: string;
  /** "20:00" (24 h) */
  time: string;
  /** "2026-11-05T20:00-05:00", for <time dateTime> */
  iso: string;
};

const z = (n: number) => String(n).padStart(2, '0');

export function panamaDateParts(d: Date): DateParts {
  const p = new Date(d.getTime() - 5 * 3_600_000);
  const day = z(p.getUTCDate());
  const monthIndex = p.getUTCMonth();
  const year = String(p.getUTCFullYear());
  const time = `${z(p.getUTCHours())}:${z(p.getUTCMinutes())}`;
  return {
    day,
    month: MONTHS[monthIndex],
    monthLong: MONTHS_LONG[monthIndex],
    weekday: WEEKDAYS[p.getUTCDay()],
    weekdayLong: WEEKDAYS_LONG[p.getUTCDay()],
    year,
    time,
    iso: `${year}-${z(monthIndex + 1)}-${day}T${time}-05:00`,
  };
}

/** "sáb 5 nov · 20:00" */
export function shortDateLabel(parts: DateParts): string {
  return `${parts.weekday} ${Number(parts.day)} ${parts.month} · ${parts.time}`;
}

/** "sábado 5 de noviembre de 2026, 20:00" */
export function longDateLabel(parts: DateParts): string {
  return `${parts.weekdayLong} ${Number(parts.day)} de ${parts.monthLong} de ${parts.year}, ${parts.time}`;
}
