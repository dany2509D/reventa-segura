// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // With a real DATABASE_URL, migrations are an explicit deploy step (`npm run db:migrate`) unless
  // AUTO_MIGRATE=1. The local dev database (PGlite) always migrates itself.
  if (process.env.DATABASE_URL && process.env.AUTO_MIGRATE !== '1') return;
  const { migrateDb } = await import('@/lib/db/client');
  await migrateDb();
}
