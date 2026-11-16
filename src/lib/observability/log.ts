/**
 * Structured logging without personal data (RNF-10, SEG-12). Every call writes exactly one JSON
 * line (info → stdout, warn/error → stderr), which Vercel's log drains can parse and filter on.
 *
 * Redaction is applied to the message and the whole context, recursively:
 *  - any key that names a secret or personal datum is replaced, whatever its value;
 *  - inside string values, phone numbers (E.164 or a bare 507 prefix) and 6-digit codes are masked;
 *  - an Error is reduced to its name: messages can carry bound query parameters (phone numbers).
 * Logging never throws: a broken context must not turn a handled error into a crash.
 */

export type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /phone|cedula|token|code|secret|authorization|cookie|password|bank_?ref/i;
// +50761234567, +1 415 555 0100 written without spaces, and 507 numbers missing the plus sign.
const PHONE_IN_TEXT = /\+[1-9]\d{6,14}\b|\b507\d{7,8}\b/g;
const CODE_IN_TEXT = /\b\d{6}\b/g;
const MAX_DEPTH = 8;

const REDACTED = '[redacted]';

function redactText(s: string): string {
  return s.replace(PHONE_IN_TEXT, '[phone]').replace(CODE_IN_TEXT, '[code]');
}

function walk(value: unknown, depth: number, ancestors: object[]): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`;
  if (ancestors.includes(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';

  ancestors.push(value);
  try {
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1, ancestors));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : walk(v, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.pop();
  }
}

/** A copy of `value` that is safe to log. */
export function redact(value: unknown): unknown {
  return walk(value, 0, []);
}

/** The error's class name only (never its message), for logs. */
export function errorName(e: unknown): string {
  return e instanceof Error ? e.name : 'UnknownError';
}

function write(level: LogLevel, msg: string, ctx: Record<string, unknown> | undefined, isAlert: boolean): void {
  let line: string;
  try {
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level, msg: redactText(msg) };
    if (isAlert) entry.alert = true;
    if (ctx !== undefined) entry.ctx = redact(ctx);
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ time: new Date().toISOString(), level, msg: 'unserialisable log entry' });
  }
  if (level === 'info') console.log(line);
  else if (level === 'warn') console.warn(line);
  else console.error(line);
}

export function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  write(level, msg, ctx, false);
}

/**
 * Something an operator must look at (failed webhook, release or refund, SMS budget exhausted).
 * Same line as an error log plus `"alert": true`, so a log drain can page on that field.
 */
export function alert(name: string, ctx?: Record<string, unknown>): void {
  write('error', name, ctx, true);
}
