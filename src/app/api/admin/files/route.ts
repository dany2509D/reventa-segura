import { NextResponse } from 'next/server';
import { adminAccess } from '@/lib/admin/guard';
import { readSessionToken } from '@/lib/auth/request-session';
import { getDb } from '@/lib/db/client';
import { signedUrl } from '@/lib/uploads/uploads';

// Admin click-through to a private file: mints a short-lived signed URL for the file route (which
// re-checks the session, authorises and audits the read) and redirects to it. A non-admin gets 404.
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path');
  const access = await adminAccess(getDb(), readSessionToken(req));
  if (access.state !== 'ok' || !path) return new NextResponse('Not found', { status: 404 });
  // Defence in depth on top of parseFilePath (exactly `<kind>/<uuid>/<uuid>`): no traversal,
  // backslashes, control characters or oversized keys ever reach the signer.
  if (path.length > 200 || path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const url = signedUrl(path, access.actor);
    return new NextResponse(null, { status: 302, headers: { location: url, 'cache-control': 'no-store' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
