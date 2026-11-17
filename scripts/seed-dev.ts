// Usage: npm run seed:dev   — demo data only (refuses to run in production).
// Idempotent: events are matched by name + venue and listings by fingerprint, so re-running it
// never duplicates anything. Venue coordinates are approximate (they only feed the check-in geofence).
import './load-env';
import { eq } from 'drizzle-orm';
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

type EventSpec = {
  name: string;
  venue: string;
  lat: number;
  lng: number;
  radiusM: number;
  startsAt: Date;
  faceValueCents: number;
};

// Panama is UTC-5 all year (no DST).
const at = (iso: string) => new Date(`${iso}-05:00`);

const EVENTS: EventSpec[] = [
  { name: 'Concierto Bad Bunny', venue: 'Estadio Rommel Fernández', lat: 9.0, lng: -79.5, radiusM: 500, startsAt: new Date(Date.now() + 10 * DAY), faceValueCents: 12000 },
  { name: 'Panamá vs Costa Rica', venue: 'Estadio Rod Carew', lat: 9.0, lng: -79.5, radiusM: 400, startsAt: new Date(Date.now() + 20 * DAY), faceValueCents: 4000 },
  { name: 'Panamá vs Jamaica · Amistoso', venue: 'Estadio Rommel Fernández', lat: 9.0953, lng: -79.4358, radiusM: 800, startsAt: at('2026-12-19T19:30:00'), faceValueCents: 2500 },
  { name: 'Gala Navideña · Orquesta Sinfónica Nacional', venue: 'Teatro Nacional', lat: 8.9519, lng: -79.5357, radiusM: 300, startsAt: at('2026-12-17T19:30:00'), faceValueCents: 3000 },
  { name: 'Fin de Año Salsero', venue: 'Figali Convention Center', lat: 8.9296, lng: -79.55, radiusM: 600, startsAt: at('2026-12-31T22:00:00'), faceValueCents: 6000 },
  { name: 'Panamá Jazz Festival 2027', venue: 'Teatro Anayansi', lat: 9.0036, lng: -79.5008, radiusM: 500, startsAt: at('2027-01-15T20:00:00'), faceValueCents: 3500 },
  { name: 'Concierto Urbano en Plaza Figali', venue: 'Plaza Figali', lat: 8.9301, lng: -79.5494, radiusM: 500, startsAt: at('2027-01-23T20:00:00'), faceValueCents: 4500 },
  { name: 'La Casa de Bernarda Alba · Teatro', venue: 'Teatro Anayansi', lat: 9.0036, lng: -79.5008, radiusM: 500, startsAt: at('2027-01-29T20:00:00'), faceValueCents: 2800 },
  { name: 'Panamá Fest 2027', venue: 'Centro de Convenciones Amador', lat: 8.93, lng: -79.545, radiusM: 900, startsAt: at('2027-02-06T16:00:00'), faceValueCents: 8500 },
];

type ListingSpec = { event: string; seller: 0 | 1; askCents: number };

// Fingerprint = "seed-<n>" (position in this list + 1), so re-ordering existing rows would change them: append only.
const LISTINGS: ListingSpec[] = [
  { event: 'Concierto Bad Bunny', seller: 0, askCents: 15000 },
  { event: 'Concierto Bad Bunny', seller: 0, askCents: 17500 },
  { event: 'Panamá vs Costa Rica', seller: 0, askCents: 5000 },
  { event: 'Panamá vs Jamaica · Amistoso', seller: 0, askCents: 2800 },
  { event: 'Panamá vs Jamaica · Amistoso', seller: 1, askCents: 3500 },
  { event: 'Gala Navideña · Orquesta Sinfónica Nacional', seller: 1, askCents: 3500 },
  { event: 'Fin de Año Salsero', seller: 0, askCents: 7500 },
  { event: 'Fin de Año Salsero', seller: 1, askCents: 9000 },
  { event: 'Panamá Jazz Festival 2027', seller: 1, askCents: 4000 },
  { event: 'Concierto Urbano en Plaza Figali', seller: 0, askCents: 5500 },
  { event: 'La Casa de Bernarda Alba · Teatro', seller: 1, askCents: 3200 },
  { event: 'Panamá Fest 2027', seller: 0, askCents: 10000 },
];

async function ensureSeller(phone: string) {
  await db.insert(users).values({ phone, identityStatus: 'approved' }).onConflictDoNothing();
  const [row] = await db.select().from(users).where(eq(users.phone, phone));
  return row;
}

const sellers = [await ensureSeller('+50760000001'), await ensureSeller('+50760000002')];

const existingEvents = await db.select().from(events);
const eventIds = new Map<string, string>();
let newEvents = 0;
for (const spec of EVENTS) {
  const found = existingEvents.find((e) => e.name === spec.name && e.venue === spec.venue);
  if (found) {
    eventIds.set(spec.name, found.id);
    continue;
  }
  const [created] = await db
    .insert(events)
    .values({ ...spec, allowsTransfer: true, resaleProhibited: false })
    .returning();
  eventIds.set(spec.name, created.id);
  newEvents++;
}

const existingFingerprints = new Set((await db.select({ f: listings.fingerprint }).from(listings)).map((r) => r.f));
let newListings = 0;
for (const [i, spec] of LISTINGS.entries()) {
  const fingerprint = `seed-${i + 1}`;
  if (existingFingerprints.has(fingerprint)) continue;
  const seller = sellers[spec.seller];
  await db.insert(listings).values({
    sellerId: seller.id,
    eventId: eventIds.get(spec.event)!,
    askCents: spec.askCents,
    deliveryMode: 'transfer',
    status: 'verified',
    fingerprint,
    proofPath: `proof/${seller.id}/00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  });
  newListings++;
}

console.log(`Seeded ${newEvents} new events and ${newListings} new verified listings (sellers +50760000001, +50760000002).`);
process.exit(0);
