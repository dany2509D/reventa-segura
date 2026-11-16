import { migrateDb } from '../src/lib/db/client';

await migrateDb();
console.log('Migrations applied.');
process.exit(0);
