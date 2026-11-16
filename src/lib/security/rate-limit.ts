import { and, count, gt, min, eq, sql } from 'drizzle-orm';
import { rateLimitHits } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';

/**
 * Sliding-window limiter backed by the database (works across serverless instances).
 * Every call records a hit, allowed or not, so a client that keeps hammering stays locked out.
 * A per-key advisory lock inside the transaction makes the decision exact under concurrency:
 * of N parallel calls exactly `limit` are allowed.
 */
export async function rateLimit(
  db: Db,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!key) throw new RangeError('rate limit key is required');
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer, got ${limit}`);
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError(`windowSeconds must be positive, got ${windowSeconds}`);
  }
  const windowMs = windowSeconds * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    await tx.insert(rateLimitHits).values({ key, at: now });
    const [row] = await tx
      .select({ n: count(), oldest: min(rateLimitHits.at) })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.at, cutoff)));
    if (row.n <= limit) return { allowed: true, retryAfterSeconds: 0 };
    const oldest = row.oldest ? new Date(row.oldest).getTime() : now.getTime();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000)) };
  });
}
