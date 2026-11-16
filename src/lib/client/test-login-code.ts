// Browser-side. Login-code TEST MODE only: asks the server for the code it would have sent by SMS.
// When test mode is off the server answers 404 and this returns null, so nothing is shown.
import { postJson } from './http';

export async function fetchTestLoginCode(phone: string): Promise<string | null> {
  const r = await postJson('/api/auth/test-code', { phone });
  const code = r.ok ? r.data.code : null;
  return typeof code === 'string' && /^\d{6}$/.test(code) ? code : null;
}
