import { eq } from 'drizzle-orm';
import { appConfig } from '@/lib/db/schema';
import type { Db, Tx } from '@/lib/db/types';

/** Positive integer from app_config, or `fallback` when missing, zero or malformed. */
export async function configInt(db: Db | Tx, key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key));
  const v = row?.value.trim();
  return v && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : fallback;
}
