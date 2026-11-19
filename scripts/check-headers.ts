// Usage: npm run check:headers -- <base-url>   (e.g. http://localhost:3100 or a Vercel preview URL)
// Smoke test of SEG-16 against a running server: every response carries the security headers, pages
// carry a per-response nonce CSP, and every <script> in the HTML has that nonce (else the browser
// would block it). Exits 1 on the first failed check. Read-only: GET requests only.
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: npm run check:headers -- <base-url>');
  process.exit(1);
}

const EXPECTED: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), geolocation=(self), microphone=(), payment=()',
};
const CSP_PARTS = ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"];

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  FAIL ${msg}`);
};

function checkHeaders(path: string, res: Response): string {
  for (const [name, value] of Object.entries(EXPECTED)) {
    const got = res.headers.get(name);
    if (got !== value) fail(`${path}: ${name} = ${JSON.stringify(got)}, expected ${JSON.stringify(value)}`);
  }
  const csp = res.headers.get('content-security-policy') ?? '';
  if (!csp) fail(`${path}: no Content-Security-Policy`);
  for (const part of CSP_PARTS) if (!csp.includes(part)) fail(`${path}: CSP lacks "${part}"`);
  const script = /script-src([^;]*)/.exec(csp)?.[1] ?? '';
  if (script.includes("'unsafe-inline'")) fail(`${path}: script-src allows 'unsafe-inline'`);
  if (script.includes("'unsafe-eval'")) fail(`${path}: script-src allows 'unsafe-eval' (development build?)`);
  return csp;
}

async function get(path: string): Promise<Response> {
  return fetch(`${base}${path}`, { redirect: 'manual' });
}

const pages = ['/ingresar', '/'];
let assetPath: string | undefined;
let checkedScripts = 0;

for (const path of pages) {
  const res = await get(path);
  console.log(`${res.status} ${path}`);
  const csp = checkHeaders(path, res);
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  if (!nonce) {
    fail(`${path}: CSP has no nonce`);
    continue;
  }
  const html = await res.text();
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  if (res.status === 200 && scripts.length === 0) fail(`${path}: no <script> tags found`);
  for (const tag of scripts) {
    // JSON-LD blocks are data, never executed, so the CSP does not apply to them (no nonce needed).
    if (/\btype="application\/ld\+json"/i.test(tag)) continue;
    checkedScripts++;
    if (!tag.includes(`nonce="${nonce}"`)) fail(`${path}: script without the response nonce: ${tag.slice(0, 120)}`);
  }
  assetPath ??= /\/_next\/static\/[^"'\s]+\.js/.exec(html)?.[0];
}

const second = /'nonce-([^']+)'/.exec((await get('/ingresar')).headers.get('content-security-policy') ?? '')?.[1];
const first = /'nonce-([^']+)'/.exec((await get('/ingresar')).headers.get('content-security-policy') ?? '')?.[1];
if (!first || first === second) fail('the nonce is not fresh per response');

const others = ['/api/auth/request', '/api/cron/maintenance', '/sw.js', '/offline.html', '/manifest.webmanifest'];
if (assetPath) others.push(assetPath);
else fail('no /_next/static asset found in the HTML');
for (const path of others) {
  const res = await get(path);
  console.log(`${res.status} ${path}`);
  checkHeaders(path, res);
  await res.arrayBuffer();
}

// Private files keep a stricter policy (next.config.ts declares it after the general /api rule).
for (const path of ['/api/files/not-a-token', '/api/orders/00000000-0000-0000-0000-000000000000/ticket']) {
  const res = await get(path);
  console.log(`${res.status} ${path}`);
  const csp = res.headers.get('content-security-policy') ?? '';
  for (const part of ["default-src 'none'", "frame-ancestors 'none'", 'sandbox']) {
    if (!csp.includes(part)) fail(`${path}: CSP lacks "${part}" (got ${JSON.stringify(csp)})`);
  }
  if (res.headers.get('referrer-policy') !== 'no-referrer') fail(`${path}: referrer-policy is not no-referrer`);
  if (res.headers.get('strict-transport-security') !== EXPECTED['strict-transport-security']) fail(`${path}: no HSTS`);
  if (res.headers.get('x-content-type-options') !== 'nosniff') fail(`${path}: no nosniff`);
  await res.arrayBuffer();
}

console.log(`${checkedScripts} <script> tags checked for the nonce.`);
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All header checks passed.');

export {}; // module scope, for top-level await
