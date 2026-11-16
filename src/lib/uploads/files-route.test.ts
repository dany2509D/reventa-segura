import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, sessions, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { createSession, hashToken } from '@/lib/auth/session';
import { getStore } from './store';
import { signedUrl, storePrivate } from './uploads';

let db: Db;
vi.mock('@/lib/db/client', () => ({ getDb: () => db }));
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

import { GET } from '@/app/api/files/[token]/route';

type Who = { actor: Actor; cookie: string };
let owner: Who;
let other: Who;
let admin: Who;
let adminNoMfa: Who;
let png: Buffer;

async function login(phone: string, role: 'user' | 'admin', mfa: boolean): Promise<Who> {
  const [u] = await db.insert(users).values({ phone, role }).returning({ id: users.id });
  const token = await createSession(db, u.id, role);
  if (mfa) await db.update(sessions).set({ mfa: true }).where(eq(sessions.tokenHash, hashToken(token)));
  return { actor: { userId: u.id, role, mfa }, cookie: `session=${token}` };
}

function fetchFile(url: string, cookie?: string) {
  const token = url.replace(/^\/api\/files\//, '');
  const req = new Request(`http://localhost${url}`, {
    headers: cookie ? { cookie: `theme=dark; ${cookie}` } : {},
  });
  return GET(req, { params: Promise.resolve({ token }) });
}

async function readAudits() {
  return db.select().from(auditLog).where(eq(auditLog.action, 'file.read'));
}

beforeEach(async () => {
  db = await makeTestDb();
  owner = await login('+50760000011', 'user', false);
  other = await login('+50760000012', 'user', false);
  admin = await login('+50760000013', 'admin', true);
  adminNoMfa = await login('+50760000014', 'admin', false);
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/files/[token]', () => {
  it('serves the owner their file with hardened headers', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, owner.actor), owner.cookie);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 401 without a session', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, owner.actor));
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 401 for an unknown session token', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, owner.actor), 'session=not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-owner, non-admin user holding the owner URL', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, owner.actor), other.cookie);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).not.toContain(path);
    expect(body).not.toContain(owner.actor.userId);
  });

  it('returns 403 for an admin whose current session has not passed 2FA', async () => {
    const path = await storePrivate(getStore(), png, 'selfie', owner.actor.userId);
    // URL issued while the admin had 2FA; presented from a session without it.
    const url = signedUrl(path, { ...adminNoMfa.actor, mfa: true });
    expect((await fetchFile(url, adminNoMfa.cookie)).status).toBe(403);
    expect(await readAudits()).toHaveLength(0);
  });

  it('returns 403 for an expired URL', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const url = signedUrl(path, owner.actor, { now: new Date(Date.now() - 61_000) });
    expect((await fetchFile(url, owner.cookie)).status).toBe(403);
  });

  it('returns 403 for a tampered token', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const url = signedUrl(path, owner.actor);
    const res = await fetchFile(`${url.slice(0, -3)}AAA`, owner.cookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 when the blob does not exist', async () => {
    const path = `identity/${owner.actor.userId}/${randomUUID()}`;
    expect((await fetchFile(signedUrl(path, owner.actor), owner.cookie)).status).toBe(404);
  });

  it('serves an identity document to an admin with 2FA and audits the read', async () => {
    const path = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, admin.actor), admin.cookie);
    expect(res.status).toBe(200);
    const rows = await readAudits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.actor.userId,
      entity: 'file',
      entityId: path,
      detail: { kind: 'identity', ownerId: owner.actor.userId },
    });
  });

  it('audits every read of identity and selfie files, including by the owner', async () => {
    const doc = await storePrivate(getStore(), png, 'identity', owner.actor.userId);
    const selfie = await storePrivate(getStore(), png, 'selfie', owner.actor.userId);
    expect((await fetchFile(signedUrl(doc, owner.actor), owner.cookie)).status).toBe(200);
    expect((await fetchFile(signedUrl(doc, owner.actor), owner.cookie)).status).toBe(200);
    expect((await fetchFile(signedUrl(selfie, owner.actor), owner.cookie)).status).toBe(200);
    const rows = await readAudits();
    expect(rows.map((r) => r.entityId).sort()).toEqual([doc, doc, selfie].sort());
    expect(rows.every((r) => r.actorId === owner.actor.userId)).toBe(true);
  });

  it('does not audit an owner reading their own non-identity file', async () => {
    const proof = await storePrivate(getStore(), png, 'proof', owner.actor.userId);
    expect((await fetchFile(signedUrl(proof, owner.actor), owner.cookie)).status).toBe(200);
    expect(await readAudits()).toHaveLength(0);
  });

  it.each(['proof', 'ticket', 'evidence'] as const)(
    "audits an admin reading someone else's %s file",
    async (kind) => {
      const path = await storePrivate(getStore(), png, kind, owner.actor.userId);
      expect((await fetchFile(signedUrl(path, admin.actor), admin.cookie)).status).toBe(200);
      const rows = await readAudits();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: admin.actor.userId,
        entity: 'file',
        entityId: path,
        detail: { kind, ownerId: owner.actor.userId },
      });
    },
  );

  it('does not serve a cross-owner read when the audit row cannot be written', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = await storePrivate(getStore(), png, 'ticket', owner.actor.userId);
    const url = signedUrl(path, admin.actor);
    vi.spyOn(db, 'transaction').mockImplementation((() => {
      throw new Error('db down');
    }) as unknown as Db['transaction']);
    const res = await fetchFile(url, admin.cookie);
    expect(res.status).toBe(500);
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it('serves PDFs as named attachments with the PDF content type', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const path = await storePrivate(getStore(), pdf, 'identity', owner.actor.userId);
    const res = await fetchFile(signedUrl(path, owner.actor), owner.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="documento.pdf"');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  it('sends a sandboxing CSP on image and error responses too', async () => {
    const path = await storePrivate(getStore(), png, 'proof', owner.actor.userId);
    const ok = await fetchFile(signedUrl(path, owner.actor), owner.cookie);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toBe('inline');
    expect(ok.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    const denied = await fetchFile(signedUrl(path, owner.actor), other.cookie);
    expect(denied.status).toBe(403);
    expect(denied.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });
});
