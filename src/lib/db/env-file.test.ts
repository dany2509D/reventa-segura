import { describe, expect, it } from 'vitest';
import { setDatabasePassword } from './env-file';

const ENV = [
  'FILE_URL_SECRET=abc',
  '',
  '# --- Supabase ---',
  '# DATABASE_URL=postgresql://postgres.myref:TU_CONTRASENA@aws-0-us-east-2.pooler.supabase.com:5432/postgres',
  'CRON_SECRET=xyz',
].join('\n');

describe('setDatabasePassword', () => {
  it('fills the placeholder, uncomments the line and leaves everything else untouched', () => {
    const out = setDatabasePassword(ENV, 'Abc123xyz');
    expect(out).toContain('\nDATABASE_URL=postgresql://postgres.myref:Abc123xyz@aws-0-us-east-2.pooler.supabase.com:5432/postgres\n');
    expect(out).not.toContain('# DATABASE_URL');
    expect(out).not.toContain('TU_CONTRASENA');
    expect(out.split('\n').filter((l) => l.startsWith('FILE_URL_SECRET') || l.startsWith('CRON_SECRET'))).toEqual([
      'FILE_URL_SECRET=abc',
      'CRON_SECRET=xyz',
    ]);
  });

  it.each([
    ['p@ss', 'p%40ss'],
    ['a:b', 'a%3Ab'],
    ['a/b', 'a%2Fb'],
    ['a#b', 'a%23b'],
    ['a?b', 'a%3Fb'],
    ['100%', '100%25'],
    ['con espacio', 'con%20espacio'],
    ['ñandú', '%C3%B1and%C3%BA'],
  ])('percent-encodes %j as %s so the URL stays valid', (pwd, enc) => {
    expect(setDatabasePassword(ENV, pwd)).toContain(`:${enc}@aws-0-us-east-2`);
  });

  it('can be run again to replace an already active password', () => {
    const once = setDatabasePassword(ENV, 'first');
    const twice = setDatabasePassword(once, 'second');
    expect(twice).toContain('myref:second@');
    expect(twice).not.toContain('first');
    expect(twice.match(/^DATABASE_URL=/gm)).toHaveLength(1);
  });

  it('keeps Windows line endings', () => {
    const crlf = ENV.replace(/\n/g, '\r\n');
    const out = setDatabasePassword(crlf, 'x1y2z3');
    expect(out).toContain('DATABASE_URL=postgresql://postgres.myref:x1y2z3@aws-0-us-east-2.pooler.supabase.com:5432/postgres\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it.each(['', '   ', 'two\nlines', 'cr\rhere'])('rejects an unusable password (%j)', (pwd) => {
    expect(() => setDatabasePassword(ENV, pwd)).toThrow();
  });

  it('fails clearly when there is no DATABASE_URL line, and never echoes the password', () => {
    let message = '';
    try {
      setDatabasePassword('FILE_URL_SECRET=abc\n', 'SuperSecret999');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('SuperSecret999');
  });

  it('refuses a non-postgres DATABASE_URL line it does not understand', () => {
    expect(() => setDatabasePassword('DATABASE_URL=mysql://u:p@h/db\n', 'x1y2z3')).toThrow(/DATABASE_URL/);
  });
});
