// IPv4 or IPv6 (letters, digits, dots, colons only); anything else is not used as a key.
const IP = /^[0-9a-fA-F.:]{2,45}$/;

/**
 * The client address used to key per-IP rate limits (SEG-07).
 *
 * Route handlers do not see the socket address, only headers, and a client can send any
 * X-Forwarded-For it likes. The rule is therefore: take the LAST X-Forwarded-For hop, which is the
 * one appended by the proxy closest to us, then X-Real-IP, else "unknown".
 *  - On Vercel (the deployment target) the platform overwrites X-Forwarded-For with the real client
 *    address, so it holds one entry and first == last.
 *  - Self-hosted, the app must sit behind one trusted reverse proxy that appends the remote address
 *    (nginx: proxy_add_x_forwarded_for); without one, both headers are client-controlled.
 * "unknown" puts every header-less request in one shared bucket: fail closed, not open.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last && IP.test(last)) return last;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real && IP.test(real)) return real;
  return 'unknown';
}
