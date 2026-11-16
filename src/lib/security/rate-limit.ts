import { and, count, gt, inArray, lt, min, eq, sql } from 'drizzle-orm';
import { rateLimitHits } from '@/lib/db/schema';
import type { Db } from '@/lib/db/types';

/**
 * Sliding-window limiter backed by the database (works across serverless instances).
 * Only allowed calls are recorded: a flood of rejected requests adds no rows (the table cannot be
 * filled by an attacker), and the lockout ends when the oldest allowed hit leaves the window.
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
    const [row] = await tx
      .select({ n: count(), oldest: min(rateLimitHits.at) })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.at, cutoff)));
    if (row.n >= limit) {
      const oldest = row.oldest ? new Date(row.oldest).getTime() : now.getTime();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000)) };
    }
    await tx.insert(rateLimitHits).values({ key, at: now });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

/** Hits older than this are outside every window in use (the longest is one day). */
export const RATE_LIMIT_RETENTION_SECONDS = 2 * 24 * 60 * 60;

/** Deletes expired hits in bounded batches (run by the maintenance cron); returns how many rows went. */
export async function purgeRateLimitHits(db: Db, now: Date = new Date(), batchSize = 1000): Promise<number> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_SECONDS * 1000);
  let total = 0;
  for (;;) {
    const ids = await db.select({ id: rateLimitHits.id }).from(rateLimitHits).where(lt(rateLimitHits.at, cutoff)).limit(batchSize);
    if (ids.length === 0) return total;
    await db.delete(rateLimitHits).where(inArray(rateLimitHits.id, ids.map((r) => r.id)));
    const n = ids.length;
    total += n;
    if (n < batchSize) return total;
  }
}
