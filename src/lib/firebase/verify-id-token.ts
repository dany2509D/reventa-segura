import { X509Certificate, createPublicKey, createVerify } from 'node:crypto';

/*
 * Verifies a Firebase ID token (RS256 JWT) against Google's public signing certificates, without
 * firebase-admin. Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens: the
 * signature, `exp`/`iat`, `aud` === project id, `iss` === https://securetoken.google.com/<project>
 * and a non-empty `sub` are all checked.
 */

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_S = 60;

export type FirebaseIdToken = { uid: string; phoneNumber: string | null };

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function signingCerts(now: number): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > now) return certCache.certs;
  const res = await fetch(CERTS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('firebase certs unavailable');
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1];
  const certs = (await res.json()) as Record<string, string>;
  certCache = { certs, expiresAt: now + (maxAge ? Number(maxAge) : 3600) * 1000 };
  return certs;
}

const b64urlJson = (s: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;

/** Returns the verified claims, or null for any invalid token. Throws only when certs cannot be fetched. */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
  now: number = Date.now(),
): Promise<FirebaseIdToken | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const pem = (await signingCerts(now))[header.kid];
  if (!pem) return null;
  const valid = createVerify('RSA-SHA256')
    .update(`${parts[0]}.${parts[1]}`)
    .verify(createPublicKey(new X509Certificate(pem).publicKey), Buffer.from(parts[2], 'base64url'));
  if (!valid) return null;

  const nowS = Math.floor(now / 1000);
  const { exp, iat, aud, iss, sub, phone_number: phone } = payload;
  if (typeof exp !== 'number' || exp + CLOCK_SKEW_S < nowS) return null;
  if (typeof iat !== 'number' || iat - CLOCK_SKEW_S > nowS) return null;
  if (aud !== projectId || iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof sub !== 'string' || !sub) return null;
  return { uid: sub, phoneNumber: typeof phone === 'string' ? phone : null };
}
