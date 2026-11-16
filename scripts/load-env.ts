// Loads .env.local, then .env, into process.env for the npm scripts (Next.js does this for the app,
// tsx does not). Variables already set in the shell win; nothing is printed.
// Import it FIRST in every script that touches the database, or the script would silently use the
// local PGlite database instead of the one configured in .env.local.
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
