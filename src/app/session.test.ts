import { describe, expect, it, vi } from 'vitest';

// session.ts imports next/headers and next/navigation at module level; only the pure helper is tested.
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

const { safeNext } = await import('./session');

describe('safeNext (login redirect target)', () => {
  it.each(['/', '/mis-ordenes', '/comprar/abc?x=1', '/eventos/123#top'])('keeps the same-site path %s', (p) => {
    expect(safeNext(p)).toBe(p);
  });

  it.each([
    null,
    undefined,
    '',
    'mis-ordenes',
    '//evil.example',
    '///evil.example',
    'https://evil.example',
    'http://evil.example/x',
    'javascript:alert(1)',
    '/\\evil.example',
    '\\\\evil.example',
  ])('falls back to / for %j (no open redirect)', (p) => {
    expect(safeNext(p as string | null | undefined)).toBe('/');
  });
});
