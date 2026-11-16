import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ensureAdminKeyLine } from './admin-key-file';

// Generated per run: no secret is written in this file.
const KEY = randomBytes(32).toString('hex');
const OTHER = randomBytes(32).toString('hex');

const ENV = ['FILE_URL_SECRET=abc', '', '# comentario', 'TEST_MODE_SHOW_LOGIN_CODE=1', 'CRON_SECRET=xyz', ''].join('\n');

const keyLines = (text: string) => text.split(/\r?\n/).filter((l) => /^\s*(export\s+)?TEST_MODE_ADMIN_KEY\s*=/.test(l));

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected an error');
}

describe('ensureAdminKeyLine', () => {
  it('adds the key, with a comment, as its own last line when absent; everything else stays byte-for-byte', () => {
    const r = ensureAdminKeyLine(ENV, KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.text.startsWith(ENV)).toBe(true);
    const tail = r.text.slice(ENV.length).split('\n');
    expect(tail[0]).toMatch(/^# .*admin:code/);
    expect(tail[1]).toBe(`TEST_MODE_ADMIN_KEY=${KEY}`);
    expect(tail[2]).toBe('');
    expect(tail).toHaveLength(3);
  });

  it('a file without a final newline gets one before the new lines (the last line is not glued to the comment)', () => {
    const r = ensureAdminKeyLine('CRON_SECRET=xyz', KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('CRON_SECRET=xyz');
    expect(lines[1]).toMatch(/^# /);
    expect(lines[2]).toBe(`TEST_MODE_ADMIN_KEY=${KEY}`);
  });

  it('an empty or missing file just gets the comment and the key', () => {
    const r = ensureAdminKeyLine('', KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.text).toMatch(new RegExp(`^# [^\\n]+\\nTEST_MODE_ADMIN_KEY=${KEY}\\n$`));
  });

  it('keeps Windows line endings (CRLF everywhere, no bare LF added)', () => {
    const crlf = ENV.replace(/\n/g, '\r\n');
    const r = ensureAdminKeyLine(crlf, KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.text.startsWith(crlf)).toBe(true);
    expect(r.text.endsWith(`TEST_MODE_ADMIN_KEY=${KEY}\r\n`)).toBe(true);
    expect(r.text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps CRLF also when the file does not end with a newline', () => {
    const r = ensureAdminKeyLine('A=1\r\nB=2', KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.text.startsWith('A=1\r\nB=2\r\n# ')).toBe(true);
    expect(r.text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps a UTF-8 BOM at the start of the file', () => {
    const r = ensureAdminKeyLine(`﻿${ENV}`, KEY);
    expect(r.status === 'added' && r.text.startsWith(`﻿${ENV}`)).toBe(true);
  });

  it.each([
    ['plain', `TEST_MODE_ADMIN_KEY=${OTHER}`],
    ['double-quoted', `TEST_MODE_ADMIN_KEY="${OTHER}"`],
    ['single-quoted', `TEST_MODE_ADMIN_KEY='${OTHER}'`],
    ['with spaces around =', `TEST_MODE_ADMIN_KEY = ${OTHER}`],
    ['with export', `export TEST_MODE_ADMIN_KEY=${OTHER}`],
    ['with an inline comment', `TEST_MODE_ADMIN_KEY=${OTHER} # clave local`],
  ])('no-op when a usable key is already there (%s): never duplicated, never replaced', (_case, line) => {
    const text = `${ENV}${line}\n`;
    expect(ensureAdminKeyLine(text, KEY)).toEqual({ status: 'present' });
  });

  it('running it twice does not duplicate the key', () => {
    const first = ensureAdminKeyLine(ENV, KEY);
    expect(first.status).toBe('added');
    if (first.status !== 'added') return;
    expect(ensureAdminKeyLine(first.text, OTHER)).toEqual({ status: 'present' });
    expect(keyLines(first.text)).toHaveLength(1);
  });

  it.each([
    ['TEST_MODE_ADMIN_KEY='],
    ['TEST_MODE_ADMIN_KEY=""'],
    ["TEST_MODE_ADMIN_KEY=''"],
    ['TEST_MODE_ADMIN_KEY=   '],
  ])('an empty placeholder (%j, as copied from .env.example) is filled in place, not duplicated', (placeholder) => {
    const text = ['A=1', placeholder, 'B=2', ''].join('\r\n');
    const r = ensureAdminKeyLine(text, KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.text).toBe(['A=1', `TEST_MODE_ADMIN_KEY=${KEY}`, 'B=2', ''].join('\r\n'));
  });

  it('a commented-out line does not count: a new active line is added', () => {
    const text = `${ENV}# TEST_MODE_ADMIN_KEY=${OTHER}\n`;
    const r = ensureAdminKeyLine(text, KEY);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(keyLines(r.text)).toEqual([`TEST_MODE_ADMIN_KEY=${KEY}`]);
  });

  it('a too-short existing value is an error asking the owner to delete that line; it never echoes the value', () => {
    const short = 'abc123short';
    const message = errorOf(() => ensureAdminKeyLine(`${ENV}TEST_MODE_ADMIN_KEY=${short}\n`, KEY));
    expect(message).toMatch(/TEST_MODE_ADMIN_KEY/);
    expect(message).toMatch(/borra/i);
    expect(message).toMatch(/32/);
    expect(message).not.toContain(short);
    expect(message).not.toContain(KEY);
  });

  it('more than one active line is an error (the owner keeps one); values are not echoed', () => {
    const text = `${ENV}TEST_MODE_ADMIN_KEY=${OTHER}\nTEST_MODE_ADMIN_KEY=${KEY}\n`;
    const message = errorOf(() => ensureAdminKeyLine(text, KEY));
    expect(message).toMatch(/más de una/);
    expect(message).not.toContain(OTHER);
    expect(message).not.toContain(KEY);
  });

  it.each([
    ['empty', ''],
    ['too short', 'a'.repeat(31)],
    ['with a space', `${'a'.repeat(32)} b`],
    ['with a newline', `${'a'.repeat(32)}\nX=1`],
    ['with a quote', `${'a'.repeat(32)}"`],
    ['with #', `${'a'.repeat(32)}#`],
  ])('refuses to write an unusable new key (%s)', (_case, bad) => {
    expect(() => ensureAdminKeyLine(ENV, bad)).toThrow();
  });
});
