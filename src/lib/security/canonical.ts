/**
 * One address per page: plain HTTP goes to HTTPS and the "other" spelling of the domain
 * (www ↔ apex) goes to the one in SITE_URL, both with a permanent 301. Search engines then see a
 * single version of every URL, and browsers never keep using an unencrypted one. Vercel already
 * upgrades HTTP at the edge; this covers any other host and the www/apex choice.
 *
 * Pure function used by src/proxy.ts. Hosts that are not the canonical one or its www/apex twin
 * (a Vercel preview URL, say) are never redirected to another host, only upgraded to HTTPS.
 */

export interface CanonicalInput {
  /** The request URL as the app sees it. */
  url: URL;
  method: string;
  /** `X-Forwarded-Proto` header (set by the platform's proxy), if any. */
  forwardedProto: string | null;
  /** `X-Forwarded-Host` or `Host` header, if any. */
  host: string | null;
  /** Canonical origin from siteUrl(). */
  siteUrl: string;
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/i;

const stripPort = (host: string) => host.replace(/:\d+$/, '');

/** The URL to redirect to (permanently), or null when the request is already canonical. */
export function canonicalRedirect({ url, method, forwardedProto, host, siteUrl }: CanonicalInput): URL | null {
  // Only navigations: a redirected POST would silently become a GET.
  if (method !== 'GET' && method !== 'HEAD') return null;

  const requestHost = (host?.split(',')[0] ?? url.host).trim().toLowerCase();
  const bareHost = stripPort(requestHost);
  if (!bareHost || LOCAL.test(bareHost)) return null;

  let canonical: URL;
  try {
    canonical = new URL(siteUrl);
  } catch {
    return null;
  }
  const canonicalHost = canonical.hostname.toLowerCase();

  const proto = (forwardedProto?.split(',')[0] ?? url.protocol.replace(':', '')).trim().toLowerCase();
  const wantsHttps = proto === 'http';

  const isTwin =
    bareHost === `www.${canonicalHost}` || (canonicalHost.startsWith('www.') && bareHost === canonicalHost.slice(4));
  const targetHost = isTwin ? canonical.host : requestHost;
  const targetProto = wantsHttps || (isTwin && canonical.protocol === 'https:') ? 'https' : proto;

  if (targetHost === requestHost && targetProto === proto) return null;
  return new URL(`${url.pathname}${url.search}`, `${targetProto}://${targetHost}`);
}
