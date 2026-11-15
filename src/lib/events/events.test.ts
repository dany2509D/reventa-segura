import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '@/lib/db/test-db';
import { auditLog, events, users } from '@/lib/db/schema';
import type { Actor, Db } from '@/lib/db/types';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { createEvent, type NewEvent } from './events';

const NOW = new Date('2026-11-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let db: Db;
let admin: Actor;
let user: Actor;

async function insertUser(role: 'user' | 'admin', phone: string): Promise<string> {
  const [row] = await db.insert(users).values({ phone, role }).returning({ id: users.id });
  return row.id;
}

function validInput(over: Partial<NewEvent> = {}): NewEvent {
  return {
    name: 'Concierto en el Estadio',
    venue: 'Estadio Rommel Fernández',
    lat: 9.0379,
    lng: -79.4659,
    radiusM: 500,
    startsAt: new Date(NOW.getTime() + 7 * DAY),
    faceValueCents: 5000,
    allowsTransfer: true,
    resaleProhibited: false,
    ...over,
  };
}

beforeEach(async () => {
  db = await makeTestDb();
  admin = { userId: await insertUser('admin', '+50760000001'), role: 'admin', mfa: true };
  user = { userId: await insertUser('user', '+50760000002'), role: 'user', mfa: false };
});

describe('createEvent authorization', () => {
  it('rejects a non-admin user', async () => {
    await expect(createEvent(db, user, validInput(), NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it('rejects a user claiming mfa but without the admin role', async () => {
    await expect(createEvent(db, { ...user, mfa: true }, validInput(), NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects an admin whose session has not passed 2FA', async () => {
    await expect(createEvent(db, { ...admin, mfa: false }, validInput(), NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await db.select().from(events)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it('checks authorization before validating the input', async () => {
    await expect(
      createEvent(db, user, validInput({ faceValueCents: 0 }), NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('createEvent by an admin with 2FA', () => {
  it('creates the event and returns the row', async () => {
    const input = validInput();
    const row = await createEvent(db, admin, input, NOW);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row).toMatchObject({ ...input, status: 'active' });
    const [stored] = await db.select().from(events).where(eq(events.id, row.id));
    expect(stored.faceValueCents).toBe(5000);
  });

  it('writes an audit row in the same operation', async () => {
    const row = await createEvent(db, admin, validInput(), NOW);
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.userId,
      action: 'event.create',
      entity: 'event',
      entityId: row.id,
    });
  });

  it('trims the name and venue', async () => {
    const row = await createEvent(db, admin, validInput({ name: '  Festival  ', venue: ' Amador ' }), NOW);
    expect(row.name).toBe('Festival');
    expect(row.venue).toBe('Amador');
  });

  it('accepts the boundary values of every numeric field', async () => {
    await expect(
      createEvent(db, admin, validInput({ lat: -90, lng: 180, radiusM: 50, faceValueCents: 1 }), NOW),
    ).resolves.toBeDefined();
    await expect(
      createEvent(db, admin, validInput({ lat: 90, lng: -180, radiusM: 5000 }), NOW),
    ).resolves.toBeDefined();
  });

  const invalid: [string, Partial<NewEvent>][] = [
    ['faceValueCents = 0', { faceValueCents: 0 }],
    ['negative faceValueCents', { faceValueCents: -500 }],
    ['fractional faceValueCents', { faceValueCents: 10.5 }],
    ['lat above 90', { lat: 90.0001 }],
    ['lat below -90', { lat: -91 }],
    ['lng above 180', { lng: 181 }],
    ['lng below -180', { lng: -180.5 }],
    ['NaN lat', { lat: Number.NaN }],
    ['radiusM below 50', { radiusM: 49 }],
    ['radiusM above 5000', { radiusM: 5001 }],
    ['fractional radiusM', { radiusM: 100.5 }],
    ['startsAt in the past', { startsAt: new Date(NOW.getTime() - 1000) }],
    ['startsAt equal to now', { startsAt: new Date(NOW.getTime()) }],
    ['invalid startsAt date', { startsAt: new Date('not a date') }],
    ['empty name', { name: '   ' }],
    ['empty venue', { venue: '' }],
  ];
  it.each(invalid)('rejects %s with ValidationError', async (_label, over) => {
    await expect(createEvent(db, admin, validInput(over), NOW)).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(events)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it('rejects non-boolean flags', async () => {
    const bad = { ...validInput(), allowsTransfer: 'yes' } as unknown as NewEvent;
    await expect(createEvent(db, admin, bad, NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a startsAt that is not a Date', async () => {
    const bad = { ...validInput(), startsAt: '2027-01-01T00:00:00Z' } as unknown as NewEvent;
    await expect(createEvent(db, admin, bad, NOW)).rejects.toBeInstanceOf(ValidationError);
  });
});
