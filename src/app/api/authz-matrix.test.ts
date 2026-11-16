import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, hashToken } from '@/lib/auth/session';
import { enrollTotp } from '@/lib/auth/totp';
import { listings, sessions, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { HOUR, seedPaidOrder } from '@/lib/orders/paid-order-fixture';
import { seedListing } from '@/lib/orders/test-fixtures';
import { FakeGateway } from '@/lib/payments/fake-gateway';
import { discoverApiHandlers, type ApiHandler } from '@/lib/testing/api-routes';
import { dbCloner } from '@/lib/tickets/test-helpers';
import { getStore } from '@/lib/uploads/store';
import { signedUrl, storePrivate } from '@/lib/uploads/uploads';

/*
 * SEG-05/SEG-06 authorization matrix. Every route handler under src/app/api is discovered by
 * walking the directory and MUST have a row in MATRIX (a new route fails the first test until it
 * is classified). Each row is exercised as: anonymous, another member, the order's other party,
 * a plain member, an admin without 2FA, a full admin, a machine caller and finally the owner (last,
 * because the owner's call may change state). Statuses are the ones the route must answer.
 */

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const freshDb = dbCloner();
const h = vi.hoisted(() => ({ db: undefined as unknown as Db }));
vi.mock('@/lib/db/client', () => ({ getDb: () => h.db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
vi.stubEnv('FAKE_GATEWAY_SECRET', 'authz-gw-secret');
vi.stubEnv('CRON_SECRET', 'authz-cron-secret-0123456789abcdef');

type Caller = 'anon' | 'other' | 'seller' | 'user' | 'adminNoMfa' | 'admin' | 'machine' | 'owner';
const ORDER: Caller[] = ['anon', 'other', 'seller', 'user', 'adminNoMfa', 'admin', 'machine', 'owner'];

type Principal = { id: string; cookie: string; actor: Actor };

type Fx = {
  stranger: Principal;
  admin: Principal;
  adminNoMfa: Principal & { totpSecret: string };
  listing: { id: string; seller: Principal };
  fileOrder: { id: string; listingId: string; buyer: Principal; seller: Principal; ticketPath: string; providerRef: string };
  transferOrder: { id: string; buyer: Principal; seller: Principal };
  buyerFile: { path: string; ownerToken: string; adminToken: string };
  eventId: string;
};

type Access =
  | 'public' // anyone, by design
  | 'member' // any signed-in member acting on their own account
  | 'owner' // a member acting on a resource that belongs to them
  | 'admin' // admin with 2FA only
  | 'machine'; // a server caller with a shared secret or signature, never a browser session

type Row = {
  access: Access;
  why: string;
  owner?: (f: Fx) => Principal;
  seller?: (f: Fx) => Principal;
  expect: Partial<Record<Caller, readonly number[]>>;
  call: (f: Fx, as: { who: Caller; cookie?: string }) => Promise<Response>;
};

// --- request helpers -------------------------------------------------------------------------------

const BASE = 'http://localhost';
const SAME_ORIGIN = { host: 'localhost', origin: BASE };
const ctx = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) });
const withCookie = (cookie?: string): Record<string, string> => (cookie ? { cookie } : {});

let handlers: Map<string, ApiHandler>;
const route = (key: string) => handlers.get(key)!.handler;

const json = (key: string, path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  route(key)(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SAME_ORIGIN, ...withCookie(cookie), ...headers },
      body: JSON.stringify(body),
    }),
    ctx(),
  );

const blob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

function upload(key: string, path: string, fields: Record<string, string | Blob>, cookie: string | undefined, params: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v);
    else fd.append(k, v, `${k}.bin`);
  }
  return route(key)(new Request(`${BASE}${path}`, { method: 'POST', headers: { ...SAME_ORIGIN, ...withCookie(cookie) }, body: fd }), ctx(params));
}

const get = (key: string, path: string, cookie: string | undefined, params: Record<string, string> = {}, headers: Record<string, string> = {}) =>
  route(key)(new Request(`${BASE}${path}`, { headers: { host: 'localhost', ...withCookie(cookie), ...headers } }), ctx(params));

// --- TOTP for the admin-without-2FA fixture ---------------------------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totpNow(secret: string): string {
  let bits = '';
  for (const c of secret) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac('sha1', key).update(msg).digest();
  const o = mac[mac.length - 1] & 0xf;
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// --- the matrix --------------------------------------------------------------------------------------

const DENIED = [403, 404] as const;

const MATRIX: Record<string, Row> = {
  'GET /api/admin/files': {
    access: 'admin',
    why: 'mints a 60 s URL to any private file; hidden (404) from everyone but a 2FA admin',
    expect: { anon: [404], user: [404], adminNoMfa: [404], admin: [302] },
    call: (f, { cookie }) => get('GET /api/admin/files', `/api/admin/files?path=${encodeURIComponent(f.buyerFile.path)}`, cookie),
  },
  'POST /api/auth/logout': {
    access: 'public',
    why: 'only ever revokes the caller’s own session cookie',
    expect: { anon: [200], user: [200] },
    call: (_f, { cookie }) => json('POST /api/auth/logout', '/api/auth/logout', {}, cookie),
  },
  'POST /api/auth/mfa': {
    access: 'member',
    why: 'second login step: needs an admin session that passed the SMS code, plus a fresh TOTP code',
    owner: (f) => f.adminNoMfa,
    expect: { anon: [401], user: [401], admin: [401], owner: [200] },
    call: (f, { who, cookie }) =>
      json('POST /api/auth/mfa', '/api/auth/mfa', { code: who === 'owner' ? totpNow(f.adminNoMfa.totpSecret) : '000000' }, cookie),
  },
  'POST /api/auth/request': {
    access: 'public',
    why: 'login step 1 (sends an SMS code); rate limited per IP, per phone and globally',
    expect: { anon: [200] },
    call: () => json('POST /api/auth/request', '/api/auth/request', { phone: '+50769990001' }),
  },
  'POST /api/auth/test-code': {
    access: 'public',
    why: 'login-code TEST MODE only (empty 404 when off); an admin phone only with the local TEST_MODE_ADMIN_KEY header and never in production (TOTP still required); a phone with no captured code is a 404',
    expect: { anon: [404] },
    call: () => json('POST /api/auth/test-code', '/api/auth/test-code', { phone: '+50769990002' }),
  },
  'POST /api/auth/verify': {
    access: 'public',
    why: 'login step 2: the SMS code is the credential',
    expect: { anon: [401] },
    call: () => json('POST /api/auth/verify', '/api/auth/verify', { phone: '+50769990002', code: '000000' }),
  },
  'POST /api/checkout': {
    access: 'member',
    why: 'any member may buy any verified listing (buying one’s own is a 422, see checkout tests)',
    owner: (f) => f.stranger,
    expect: { anon: [401], owner: [200] },
    call: (f, { cookie }) => json('POST /api/checkout', '/api/checkout', { listingId: f.listing.id }, cookie),
  },
  'GET /api/cron/maintenance': {
    access: 'machine',
    why: 'Vercel Cron with Authorization: Bearer CRON_SECRET; a session cookie is worth nothing here',
    expect: { anon: [401], user: [401], admin: [401], machine: [200] },
    call: (_f, { who, cookie }) =>
      get('GET /api/cron/maintenance', '/api/cron/maintenance', cookie, {}, who === 'machine' ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
  },
  'GET /api/events/[id]/listings': {
    access: 'public',
    why: 'public catalogue: no seller, paths or fingerprints in the response',
    expect: { anon: [200] },
    call: (f) => get('GET /api/events/[id]/listings', `/api/events/${f.eventId}/listings`, undefined, { id: f.eventId }),
  },
  'GET /api/files/[token]': {
    access: 'owner',
    why: 'signed, caller-bound 60 s token AND a live session of the owner or a 2FA admin',
    owner: (f) => f.fileOrder.buyer,
    expect: { anon: [401], other: [403], adminNoMfa: [403], admin: [200], owner: [200] },
    call: (f, { who, cookie }) => {
      const url = who === 'admin' ? f.buyerFile.adminToken : f.buyerFile.ownerToken;
      const token = url.replace(/^\/api\/files\//, '');
      return get('GET /api/files/[token]', url, cookie, { token });
    },
  },
  'POST /api/identity': {
    access: 'member',
    why: 'uploads the caller’s own identity documents; never someone else’s',
    owner: (f) => f.stranger,
    expect: { anon: [401], owner: [200] },
    call: (_f, { cookie }) => upload('POST /api/identity', '/api/identity', { doc: blob(png, 'image/png'), selfie: blob(jpg, 'image/jpeg') }, cookie, {}),
  },
  'DELETE /api/listings/[id]': {
    access: 'owner',
    why: 'only the seller may withdraw their listing',
    owner: (f) => f.listing.seller,
    expect: { anon: [401], other: DENIED, admin: DENIED, owner: [200] },
    call: (f, { cookie }) =>
      route('DELETE /api/listings/[id]')(
        new Request(`${BASE}/api/listings/${f.listing.id}`, { method: 'DELETE', headers: { ...SAME_ORIGIN, ...withCookie(cookie) } }),
        ctx({ id: f.listing.id }),
      ),
  },
  'POST /api/listings': {
    access: 'member',
    why: 'publishes for the caller only; identity must be approved first (owner success, which scans QR codes, is covered by src/lib/tickets/routes.test.ts)',
    expect: { anon: [401], user: [403] },
    call: (f, { cookie }) => upload('POST /api/listings', '/api/listings', { eventId: f.eventId, askCents: '5000', deliveryMode: 'transfer' }, cookie, {}),
  },
  'POST /api/orders/[id]/dispute': {
    access: 'owner',
    why: 'only the order’s buyer may open a dispute',
    owner: (f) => f.fileOrder.buyer,
    seller: (f) => f.fileOrder.seller,
    expect: { anon: [401], other: DENIED, seller: DENIED, admin: DENIED, owner: [200] },
    call: (f, { cookie }) =>
      upload('POST /api/orders/[id]/dispute', `/api/orders/${f.fileOrder.id}/dispute`, { reason: 'No pude entrar' }, cookie, { id: f.fileOrder.id }),
  },
  'POST /api/orders/[id]/entry': {
    access: 'owner',
    why: 'only the order’s buyer confirms their entry',
    owner: (f) => f.fileOrder.buyer,
    seller: (f) => f.fileOrder.seller,
    expect: { anon: [401], other: DENIED, seller: DENIED, admin: DENIED, owner: [200] },
    call: (f, { cookie }) =>
      upload('POST /api/orders/[id]/entry', `/api/orders/${f.fileOrder.id}/entry`, { photo: blob(jpg, 'image/jpeg') }, cookie, { id: f.fileOrder.id }),
  },
  'POST /api/orders/manual': {
    access: 'member',
    why: 'any member may reserve a verified listing to pay by Yappy/ACH (409 if another checkout already holds it)',
    owner: (f) => f.stranger,
    expect: { anon: [401], owner: [200, 409] },
    call: (f, { cookie }) =>
      json('POST /api/orders/manual', '/api/orders/manual', { listingId: f.listing.id, paymentMethod: 'yappy' }, cookie),
  },
  'POST /api/orders/[id]/proof': {
    access: 'owner',
    why: 'only the order’s buyer uploads a payment receipt (and only for manual orders: gateway orders get 409)',
    owner: (f) => f.transferOrder.buyer,
    seller: (f) => f.transferOrder.seller,
    expect: { anon: [401], other: DENIED, seller: DENIED, admin: DENIED, owner: [409] },
    call: (f, { cookie }) =>
      upload('POST /api/orders/[id]/proof', `/api/orders/${f.transferOrder.id}/proof`, { proof: blob(png, 'image/png') }, cookie, {
        id: f.transferOrder.id,
      }),
  },
  'POST /api/orders/[id]/received': {
    access: 'owner',
    why: 'only the order’s buyer confirms the transfer arrived',
    owner: (f) => f.transferOrder.buyer,
    seller: (f) => f.transferOrder.seller,
    expect: { anon: [401], other: DENIED, seller: DENIED, admin: DENIED, owner: [200] },
    call: (f, { cookie }) =>
      upload('POST /api/orders/[id]/received', `/api/orders/${f.transferOrder.id}/received`, { screenshot: blob(png, 'image/png') }, cookie, {
        id: f.transferOrder.id,
      }),
  },
  'GET /api/orders/[id]/ticket': {
    access: 'owner',
    why: 'the watermarked ticket goes to the order’s buyer only (not even the seller)',
    owner: (f) => f.fileOrder.buyer,
    seller: (f) => f.fileOrder.seller,
    expect: { anon: [401], other: DENIED, seller: DENIED, admin: DENIED, owner: [200] },
    call: (f, { cookie }) => get('GET /api/orders/[id]/ticket', `/api/orders/${f.fileOrder.id}/ticket`, cookie, { id: f.fileOrder.id }),
  },
  'GET /api/listings/[id]/download': {
    access: 'owner',
    why: 'ticket file: the listing’s seller, a 2FA admin, or the buyer of a paid order (watermarked copy) only',
    owner: (f) => f.fileOrder.seller,
    seller: (f) => f.fileOrder.buyer,
    expect: { anon: [401], other: DENIED, user: DENIED, adminNoMfa: DENIED, seller: [200], admin: [200], owner: [200] },
    call: (f, { cookie }) =>
      get('GET /api/listings/[id]/download', `/api/listings/${f.fileOrder.listingId}/download`, cookie, { id: f.fileOrder.listingId }),
  },
  'POST /api/webhooks/payments': {
    access: 'machine',
    why: 'payment provider, authenticated by its signature over the raw body; cookies are ignored',
    expect: { anon: [400], user: [400], admin: [400], machine: [200] },
    call: (f, { who, cookie }) => {
      const gw = new FakeGateway(process.env.FAKE_GATEWAY_SECRET);
      const { rawBody, headers } = gw.buildWebhook({ providerRef: f.fileOrder.providerRef, status: 'paid', amountCents: 5000 });
      const sig = who === 'machine' ? headers : {};
      return route('POST /api/webhooks/payments')(
        new Request(`${BASE}/api/webhooks/payments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...withCookie(cookie), ...sig },
          body: rawBody,
        }),
        ctx(),
      );
    },
  },
};

// --- fixtures ----------------------------------------------------------------------------------------

let png: Buffer;
let jpg: Buffer;
let seq = 0;

async function principal(role: 'user' | 'admin', mfa: boolean, identityStatus: 'none' | 'approved' = 'none'): Promise<Principal> {
  const [u] = await h.db
    .insert(users)
    .values({ phone: `+5076${String(8_000_000 + ++seq).padStart(7, '0')}`, role, identityStatus })
    .returning();
  return asPrincipal(u.id, role, mfa);
}

async function asPrincipal(id: string, role: 'user' | 'admin' = 'user', mfa = false): Promise<Principal> {
  const token = await createSession(h.db, id, role);
  if (mfa) await h.db.update(sessions).set({ mfa: true }).where(eq(sessions.tokenHash, hashToken(token)));
  return { id, cookie: `session=${token}`, actor: { userId: id, role, mfa } };
}

async function fixtures(): Promise<Fx> {
  const gw = new FakeGateway(process.env.FAKE_GATEWAY_SECRET);
  const stranger = await principal('user', false);
  const admin = await principal('admin', true);
  const noMfa = await principal('admin', false);
  const { secret } = await enrollTotp(h.db, noMfa.id);

  const open = await seedListing(h.db, { status: 'verified' });
  // File delivery, event in one hour: entry confirmation and disputes are open.
  const startsAt = new Date(Date.now() + HOUR);
  const file = await seedPaidOrder(h.db, gw, { deliveryMode: 'file', startsAt, paidAt: new Date(startsAt.getTime() - 24 * HOUR) });
  const ticketPath = await storePrivate(getStore(), png, 'ticket', file.seller.id);
  await h.db.update(listings).set({ filePath: ticketPath }).where(eq(listings.id, file.listing.id));
  // Transfer delivery paid ten minutes ago: the transfer window is open.
  const transfer = await seedPaidOrder(h.db, gw, {
    deliveryMode: 'transfer',
    startsAt: new Date(Date.now() + 24 * HOUR),
    paidAt: new Date(Date.now() - 10 * 60 * 1000),
  });

  const fileBuyer = await asPrincipal(file.buyer.id);
  const proofPath = await storePrivate(getStore(), png, 'proof', file.buyer.id);
  return {
    stranger,
    admin,
    adminNoMfa: { ...noMfa, totpSecret: secret },
    listing: { id: open.listing.id, seller: await asPrincipal(open.seller.id) },
    fileOrder: {
      id: file.order.id,
      listingId: file.listing.id,
      buyer: fileBuyer,
      seller: await asPrincipal(file.seller.id),
      ticketPath,
      providerRef: file.order.providerRef!,
    },
    transferOrder: { id: transfer.order.id, buyer: await asPrincipal(transfer.buyer.id), seller: await asPrincipal(transfer.seller.id) },
    buyerFile: { path: proofPath, ownerToken: signedUrl(proofPath, fileBuyer.actor), adminToken: signedUrl(proofPath, admin.actor) },
    eventId: open.event.id,
  };
}

function cookieOf(row: Row, f: Fx, who: Caller): string | undefined {
  switch (who) {
    case 'anon':
    case 'machine':
      return undefined;
    case 'other':
    case 'user':
      return f.stranger.cookie;
    case 'admin':
      return f.admin.cookie;
    case 'adminNoMfa':
      return f.adminNoMfa.cookie;
    case 'seller':
      return row.seller!(f).cookie;
    case 'owner':
      return row.owner!(f).cookie;
  }
}

// --- tests -------------------------------------------------------------------------------------------

beforeAll(async () => {
  handlers = new Map((await discoverApiHandlers()).map((x) => [x.key, x]));
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ffffff' } }).png().toBuffer();
  jpg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  await freshDb(); // migrate the template once
});
beforeEach(async () => {
  h.db = await freshDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('authorization matrix: completeness', () => {
  it('has exactly one row per route handler found under src/app/api', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it.each(Object.entries(MATRIX))('%s is classified consistently', (_key, row) => {
    expect(row.why.length).toBeGreaterThan(10);
    if (row.access !== 'public') {
      expect(row.expect.anon, 'anonymous must be refused').toBeDefined();
      for (const s of row.expect.anon!) expect(s).toBeGreaterThanOrEqual(400);
    }
    if (row.access === 'owner') {
      expect(row.owner).toBeDefined();
      expect(row.expect.other, 'another member must be refused').toBeDefined();
      for (const s of row.expect.other!) expect([403, 404]).toContain(s);
    }
    if (row.access === 'admin') {
      for (const who of ['anon', 'user', 'adminNoMfa'] as const) {
        expect(row.expect[who], who).toBeDefined();
        for (const s of row.expect[who]!) expect([401, 403, 404]).toContain(s);
      }
    }
    if (row.expect.owner) expect(row.owner).toBeDefined();
    if (row.expect.seller) expect(row.seller).toBeDefined();
  });
});

describe.each(Object.entries(MATRIX))('%s', (key, row) => {
  it(`[${row.access}] ${ORDER.filter((w) => row.expect[w]).map((w) => `${w}→${row.expect[w]!.join('/')}`).join(', ')}`, async () => {
    const f = await fixtures();
    for (const who of ORDER) {
      const allowed = row.expect[who];
      if (!allowed) continue;
      const res = await row.call(f, { who, cookie: cookieOf(row, f, who) });
      expect(allowed, `${key} as ${who}: got ${res.status}`).toContain(res.status);
    }
  });
});
