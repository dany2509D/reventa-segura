// Usage: npm run admin:create -- +50761234567
// Creates (or promotes) an admin and prints a NEW TOTP secret once. Admins cannot enroll their own
// second factor over HTTP; this out-of-band step is the only way, so a stolen SMS code is not enough.
import { eq } from 'drizzle-orm';
import { normalizePanamaPhone } from '../src/lib/auth/phone';
import { enrollTotp } from '../src/lib/auth/totp';
import { getDb, migrateDb } from '../src/lib/db/client';
import { users } from '../src/lib/db/schema';

const phone = normalizePanamaPhone(process.argv[2] ?? '');
if (!phone) {
  console.error('Usage: npm run admin:create -- <panamanian mobile number, e.g. +50761234567>');
  process.exit(1);
}
await migrateDb();
const db = getDb();
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
const id = existing
  ? existing.id
  : (await db.insert(users).values({ phone, role: 'admin' }).returning({ id: users.id }))[0].id;
if (existing) await db.update(users).set({ role: 'admin' }).where(eq(users.id, id));
const { secret, otpauthUrl } = await enrollTotp(db, id);
console.log(`Admin ready: ${phone}`);
console.log('Add this to an authenticator app (this secret is shown only now):');
console.log(`  secret : ${secret}`);
console.log(`  otpauth: ${otpauthUrl}`);
process.exit(0);
