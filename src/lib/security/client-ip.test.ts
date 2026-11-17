import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClientIp } from './client-ip';

const req = (headers: Record<string, string>) => new Request('http://localhost/api/x', { headers });

describe('getClientIp', () => {
  it('uses the only x-forwarded-for entry (what Vercel sets, overwriting the client value)', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('with several hops takes the LAST one: the address appended by the platform, not a client-written one', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' }))).toBe('198.51.100.9');
    expect(getClientIp(req({ 'x-forwarded-for': 'spoofed, 10.0.0.1 ,  198.51.100.10 ' }))).toBe('198.51.100.10');
  });

  it('accepts IPv6', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('falls back to x-real-ip, then to "unknown"', () => {
    expect(getClientIp(req({ 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5');
    expect(getClientIp(req({}))).toBe('unknown');
  });

  it('ignores garbage instead of using it as a rate-limit key', () => {
    expect(getClientIp(req({ 'x-forwarded-for': 'not an ip; drop table' }))).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': '', 'x-real-ip': 'x'.repeat(200) }))).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, <script>' , 'x-real-ip': '192.0.2.6' }))).toBe('192.0.2.6');
  });

  describe('behind Cloudflare', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('prefers cf-connecting-ip when TRUST_CLOUDFLARE_IP=1', () => {
      vi.stubEnv('TRUST_CLOUDFLARE_IP', '1');
      expect(getClientIp(req({ 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': '172.70.1.1' }))).toBe('203.0.113.50');
      expect(getClientIp(req({ 'cf-connecting-ip': 'junk!', 'x-forwarded-for': '172.70.1.1' }))).toBe('172.70.1.1');
    });

    it('ignores cf-connecting-ip unless trusted (it is forgeable when hitting the origin directly)', () => {
      expect(getClientIp(req({ 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': '172.70.1.1' }))).toBe('172.70.1.1');
    });
  });
});
