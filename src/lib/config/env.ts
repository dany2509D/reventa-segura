/**
 * Variables a production server cannot run safely without (SEG-15). Checked once at startup by
 * src/instrumentation.ts, so a misconfigured deployment fails at boot with a clear message instead
 * of on the first payment, upload or cron run. See .env.example for what each one is.
 */
export const REQUIRED_PRODUCTION_ENV = ['DATABASE_URL', 'FILE_URL_SECRET', 'CRON_SECRET', 'BLOB_READ_WRITE_TOKEN'] as const;

const MIN_FILE_URL_SECRET = 32;

export class MissingEnvError extends Error {
  constructor(readonly missing: string[]) {
    // Names only: never echo a value.
    super(`Missing or invalid production environment variables: ${missing.join(', ')}. See .env.example.`);
    this.name = 'MissingEnvError';
  }
}

type Env = Record<string, string | undefined>;

export function assertProductionEnv(env: Env = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  // `next build` also runs with NODE_ENV=production; runtime secrets need not exist at build time.
  if (env.NEXT_PHASE === 'phase-production-build') return;

  const blank = (name: string) => !env[name]?.trim();
  const missing: string[] = REQUIRED_PRODUCTION_ENV.filter(blank);
  if (!missing.includes('FILE_URL_SECRET') && env.FILE_URL_SECRET!.length < MIN_FILE_URL_SECRET) {
    missing.push(`FILE_URL_SECRET (at least ${MIN_FILE_URL_SECRET} characters)`);
  }
  if (env.ALLOW_FAKE_GATEWAY === '1' && blank('FAKE_GATEWAY_SECRET')) missing.push('FAKE_GATEWAY_SECRET');
  if (missing.length) throw new MissingEnvError(missing);
}
