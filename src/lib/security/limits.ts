import { NextResponse } from 'next/server';
import type { Db } from '@/lib/db/types';
import { rateLimit } from './rate-limit';

export type LimitRule = { readonly name: string; readonly limit: number; readonly windowSeconds: number };

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * Request budgets per route (SEG-07). Keyed by user id where there is a session, else by client IP
 * (see getClientIp). Only allowed attempts are stored; a denied client is let back in when its oldest allowed hit expires.
 * The OTP per-phone limit (5/hour) and the admin TOTP limit (5/15 min) live with their own code.
 */
export const LIMITS = {
  otpRequestIp: { name: 'otp-request-ip', limit: 20, windowSeconds: HOUR },
  otpVerifyIp: { name: 'otp-verify-ip', limit: 30, windowSeconds: 15 * 60 },
  listingCreate: { name: 'listing-create', limit: 10, windowSeconds: HOUR },
  listingWithdraw: { name: 'listing-withdraw', limit: 30, windowSeconds: HOUR },
  checkout: { name: 'checkout', limit: 20, windowSeconds: HOUR },
  identity: { name: 'identity-submit', limit: 5, windowSeconds: DAY },
  orderReceived: { name: 'order-received', limit: 20, windowSeconds: HOUR },
  orderEntry: { name: 'order-entry', limit: 20, windowSeconds: HOUR },
  orderDispute: { name: 'order-dispute', limit: 5, windowSeconds: DAY },
} as const satisfies Record<string, LimitRule>;

export const TOO_MANY_REQUESTS = 'Demasiadas solicitudes. Intenta de nuevo más tarde.';

export function limitKey(rule: LimitRule, subject: string): string {
  return `${rule.name}:${subject}`;
}

/** Counts this attempt; returns a 429 (with Retry-After) when over budget, else null. */
export async function limitOr429(
  db: Db,
  rule: LimitRule,
  subject: string,
  now: Date = new Date(),
): Promise<NextResponse | null> {
  const r = await rateLimit(db, limitKey(rule, subject), rule.limit, rule.windowSeconds, now);
  if (r.allowed) return null;
  return NextResponse.json(
    { error: TOO_MANY_REQUESTS },
    { status: 429, headers: { 'retry-after': String(r.retryAfterSeconds), 'cache-control': 'no-store' } },
  );
}
