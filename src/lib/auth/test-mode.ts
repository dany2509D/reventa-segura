import { normalizePanamaPhone } from './phone';
import type { SmsSender } from './sms';

/*
 * LOGIN-CODE TEST MODE — only while no SMS provider is configured.
 * Instead of sending an SMS, the code is kept in this process's memory so /api/auth/test-code can
 * show it on the login screen. Anyone who can reach the site can then log in as any NON-admin user
 * whose number they type, so it must never be enabled on a public deployment.
 *  - On only with TEST_MODE_SHOW_LOGIN_CODE=1, and in production only with ALSO
 *    ALLOW_TEST_LOGIN_CODES=1.
 *  - Admin numbers are not revealed (the route checks the role), except to the owner's own computer
 *    holding the local TEST_MODE_ADMIN_KEY, outside production builds (admin-test-key.ts); the
 *    admin still needs TOTP.
 *  - Phones and codes are never written to the logs.
 */

export const LOGIN_TEST_CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_TEST_CODE_MAX_ENTRIES = 1000;

type Env = Readonly<Record<string, string | undefined>>;
type Captured = { code: string; expiresAt: number };
type Globals = { __loginTestCodes?: Map<string, Captured>; __loginTestModeWarned?: boolean };
const g = globalThis as unknown as Globals;

export function isLoginCodeTestMode(env: Env = process.env): boolean {
  if (env.TEST_MODE_SHOW_LOGIN_CODE !== '1') return false;
  return env.NODE_ENV !== 'production' || env.ALLOW_TEST_LOGIN_CODES === '1';
}

// Process-global (survives dev hot reloads and is shared by every route bundle in the process).
// Insertion order = age, so the first key is the oldest.
function store(): Map<string, Captured> {
  return (g.__loginTestCodes ??= new Map());
}

export function clearCapturedLoginCodes(): void {
  store().clear();
}

/** The captured, unexpired code for this phone, or null. Reading does not consume it. */
export function peekCapturedLoginCode(phoneInput: string, now: number = Date.now()): string | null {
  const phone = normalizePanamaPhone(phoneInput);
  if (!phone) return null;
  const entry = store().get(phone);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store().delete(phone);
    return null;
  }
  return entry.code;
}

export class CapturingSmsSender implements SmsSender {
  constructor(private readonly now: () => number = Date.now) {}

  async send(phoneInput: string, text: string): Promise<void> {
    if (!g.__loginTestModeWarned) {
      g.__loginTestModeWarned = true;
      console.warn('LOGIN-CODE TEST MODE IS ON: login codes are shown on screen instead of sent by SMS. Never enable it on a public deployment.');
    }
    const phone = normalizePanamaPhone(phoneInput);
    const match = /\b(\d{6})\b/.exec(text);
    if (!phone || !match) return;
    const codes = store();
    codes.delete(phone); // re-insert at the end: newest
    codes.set(phone, { code: match[1], expiresAt: this.now() + LOGIN_TEST_CODE_TTL_MS });
    while (codes.size > LOGIN_TEST_CODE_MAX_ENTRIES) {
      codes.delete(codes.keys().next().value!);
    }
  }
}
