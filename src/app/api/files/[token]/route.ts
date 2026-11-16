import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit/audit';
import { sessionFromRequest } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/errors';
import { errorName, log } from '@/lib/observability/log';
import { PRIVATE_FILE_CSP } from '@/lib/security/headers';
import { getStore } from '@/lib/uploads/store';
import {
  MIME_TYPES,
  canReadFile,
  detectType,
  isIdentityKind,
  parseFilePath,
  verifyFileToken,
} from '@/lib/uploads/uploads';

// Sent on every response of this route, success or error. Under Next, next.config.ts headers()
// replace same-named headers, so the CSP is declared there too (same constant).
const NO_STORE = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': PRIVATE_FILE_CSP,
};

const deny = (status: 401 | 403 | 404) =>
  NextResponse.json(
    { error: status === 401 ? 'No autorizado' : status === 403 ? 'Acceso denegado' : 'No encontrado' },
    { status, headers: NO_STORE },
  );

// Serves a private file for a signed, user-bound, short-lived token (SEG-10).
// Only the owner or an admin with 2FA may read. Audited (fail closed): every
// identity/selfie read, and every read of a file by someone other than its owner.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const db = getDb();
    const actor = await sessionFromRequest(db, req);
    if (!actor) return deny(401);

    let path: string;
    try {
      path = verifyFileToken(token, actor);
    } catch (e) {
      if (e instanceof ForbiddenError) return deny(403);
      throw e;
    }
    // Re-check against the live session (role / 2FA may differ from issuance).
    const parsed = parseFilePath(path);
    if (!parsed || !canReadFile(path, actor)) return deny(403);

    const data = await getStore().get(path);
    if (!data) return deny(404);

    if (isIdentityKind(parsed.kind) || actor.userId !== parsed.ownerId) {
      // Fail closed: if the audit row cannot be written, the file is not served.
      await db.transaction((tx) =>
        audit(tx, {
          actorId: actor.userId,
          action: 'file.read',
          entity: 'file',
          entityId: path,
          detail: { kind: parsed.kind, ownerId: parsed.ownerId },
        }),
      );
    }

    const type = detectType(data);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        ...NO_STORE,
        'content-type': type ? MIME_TYPES[type] : 'application/octet-stream',
        // PDFs are not sanitized, so they are downloaded rather than rendered inline.
        'content-disposition':
          type === 'pdf'
            ? 'attachment; filename="documento.pdf"'
            : type
              ? 'inline'
              : 'attachment',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (e) {
    log('error', 'files route error', { error: errorName(e) });
    return NextResponse.json({ error: 'Error interno.' }, { status: 500, headers: NO_STORE });
  }
}
