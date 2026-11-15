import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migrations', () => {
  it('journal lists exactly the SQL files in drizzle/, in order', () => {
    const dir = join(process.cwd(), 'drizzle');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .sort();
    const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    expect(journal.entries.map((e) => e.tag)).toEqual(files);
    expect(journal.entries.map((e) => e.idx)).toEqual(files.map((_, i) => i));
  });
});
