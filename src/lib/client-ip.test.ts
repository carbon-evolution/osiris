import { describe, it, expect, vi, afterEach } from 'vitest';
import { clientIp as guardClientIp } from './guard';
import { getClientIp } from './ssrf-guard';

const forged = {
  'x-forwarded-for': '6.6.6.6',
  'x-real-ip': '7.7.7.7',
  'cf-connecting-ip': '8.8.8.8',
};
const r = (headers: Record<string, string>) => new Request('http://x/', { headers });

afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['guard.clientIp', guardClientIp],
  ['ssrf-guard.getClientIp', getClientIp],
])('%s', (_name, ip) => {
  it.each([undefined, '', 'false', '0', 'nonsense'])('ignores forwarding headers when TRUST_PROXY_HEADERS=%s', (v) => {
    vi.stubEnv('TRUST_PROXY_HEADERS', v as string);
    expect(ip(r(forged))).toBe('unknown');
  });

  it('TRUST_PROXY_HEADERS=true uses the rightmost X-Forwarded-For entry (the one our proxy appended)', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
    expect(ip(r({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(ip(r({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('TRUST_PROXY_HEADERS=2 skips one more proxy hop', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '2');
    expect(ip(r({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.0.0.2' }))).toBe('203.0.113.7');
  });

  it('falls back to X-Real-IP from a trusted proxy that only sets that', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '1');
    expect(ip(r({ 'x-real-ip': '2001:db8::5' }))).toBe('2001:db8::5');
  });

  it('TRUST_PROXY_HEADERS=cloudflare uses CF-Connecting-IP only', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'cloudflare');
    expect(ip(r(forged))).toBe('8.8.8.8');
    expect(ip(r({ 'x-forwarded-for': '6.6.6.6' }))).toBe('unknown');
  });

  it('rejects values that are not IP addresses even when trusted', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
    expect(ip(r({ 'x-forwarded-for': 'not-an-ip; DROP' }))).toBe('unknown');
    expect(ip(r({ 'x-forwarded-for': '203.0.113.7:51234' }))).toBe('203.0.113.7');
  });
});
