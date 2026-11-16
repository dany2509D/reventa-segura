// Usage: npm run seed:dev   — demo data only (refuses to run in production).
import './load-env';
import { events, listings, users } from '../src/lib/db/schema';
import { describeDatabaseTarget, getDb, migrateDb } from '../src/lib/db/client';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:dev refuses to run in production');
  process.exit(1);
}
console.log(`Database: ${process.env.DATABASE_URL ? describeDatabaseTarget(process.env.DATABASE_URL) : 'local PGlite (.data/pglite)'}`);
await migrateDb();
const db = getDb();
const DAY = 24 * 60 * 60 * 1000;
const [seller] = await db
  .insert(users)
  .values({ phone: '+50760000001', identityStatus: 'approved' })
  .onConflictDoNothing()
  .returning();
const [concierto, partido] = await db
  .insert(events)
  .values([
    { name: 'Concierto Bad Bunny', venue: 'Estadio Rommel Fernández', lat: 9.0, lng: -79.5, radiusM: 500, startsAt: new Date(Date.now() + 10 * DAY), faceValueCents: 12000, allowsTransfer: true, resaleProhibited: false },
    { name: 'Panamá vs Costa Rica', venue: 'Estadio Rod Carew', lat: 9.0, lng: -79.5, radiusM: 400, startsAt: new Date(Date.now() + 20 * DAY), faceValueCents: 4000, allowsTransfer: true, resaleProhibited: false },
  ])
  .returning();
if (seller) {
  await db.insert(listings).values([
    { sellerId: seller.id, eventId: concierto.id, askCents: 15000, deliveryMode: 'transfer', status: 'verified', fingerprint: 'seed-1', proofPath: `proof/${seller.id}/00000000-0000-4000-8000-000000000001` },
    { sellerId: seller.id, eventId: concierto.id, askCents: 17500, deliveryMode: 'transfer', status: 'verified', fingerprint: 'seed-2', proofPath: `proof/${seller.id}/00000000-0000-4000-8000-000000000002` },
    { sellerId: seller.id, eventId: partido.id, askCents: 5000, deliveryMode: 'transfer', status: 'verified', fingerprint: 'seed-3', proofPath: `proof/${seller.id}/00000000-0000-4000-8000-000000000003` },
  ]);
}
console.log('Seeded 2 events and 3 verified listings (seller +50760000001).');
process.exit(0);
