import { NextResponse } from 'next/server';
import { internalError, rejectUnsafeRequest } from '@/lib/auth/http';
import { readSessionToken } from '@/lib/auth/request-session';
import { revokeSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';

// Ends the session on the server (the token is deleted, not just forgotten by the browser).
export async function POST(req: Request) {
  const blocked = rejectUnsafeRequest(req);
  if (blocked) return blocked;
  try {
    const token = readSessionToken(req);
    if (token) await revokeSession(getDb(), token);
    const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
    res.cookies.set('session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (e) {
    return internalError(e);
  }
}
