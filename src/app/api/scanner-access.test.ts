import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// OWASP A01: the scanner proxy must be closed to anonymous remote callers by
// default. Every test records what the route tries to fetch upstream.
let calls: string[] = [];
function stubFetch() {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Response.json({ ok: true, scanned: true });
  }));
}

const ENV_KEYS = ['SCANNER_URL', 'SCANNER_KEY', 'SCANNER_ACCESS_TOKEN', 'SCANNER_ALLOW_ANONYMOUS', 'TRUST_PROXY_HEADERS'] as const;

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number] | 'NODE_ENV', string>>) {
  for (const k of ENV_KEYS) vi.stubEnv(k, undefined as unknown as string);
  vi.stubEnv('SCANNER_URL', 'http://scanner.test:7700');
  vi.stubEnv('SCANNER_KEY', 'sidecar-secret');
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

// The route reads SCANNER_URL/KEY at module load and ssrf-guard keeps its
// rate-limit map in module state, so import a fresh copy per test.
async function route() {
  vi.resetModules();
  return import('./scanner/route');
}

const PUBLIC_IP = '93.184.215.14'; // literal → no DNS in tests
function req(qs: string, headers: Record<string, string> = {}) {
  return new Request(`http://osiris.example.com/api/scanner?${qs}`, {
    headers: { host: 'osiris.example.com', ...headers },
  });
}

beforeEach(() => stubFetch());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('scanner: access gate', () => {
  it('default config (no token, no opt-in, production) → 403 and no upstream fetch', async () => {
    setEnv({ NODE_ENV: 'production' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}&type=quick`));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('token configured but missing → 401 (prompts the UI), no fetch', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}`));
    expect(res.status).toBe(401);
    expect((await res.json()).auth).toBe('token');
    expect(calls).toHaveLength(0);
  });

  it('wrong token → 401, no fetch', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}`, { 'x-scanner-token': 'correct-hors' }));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('correct token → proxied to the sidecar', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}&type=ssl`, { 'x-scanner-token': 'correct-horse' }));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].startsWith('http://scanner.test:7700/scan/ssl?')).toBe(true);
  });

  it('SCANNER_ALLOW_ANONYMOUS=true → proxied without a token', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ALLOW_ANONYMOUS: 'true' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}`));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('next dev + loopback request → proxied with zero config', async () => {
    setEnv({ NODE_ENV: 'development' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}`, { host: 'localhost:3000', 'x-forwarded-for': '::1', 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['production build, localhost Host', 'production', { host: 'localhost:3000', 'x-forwarded-for': '::1' }],
    ['dev, public Host (LAN / DNS rebinding)', 'development', { host: 'osiris.example.com', 'x-forwarded-for': '::1' }],
    ['dev, non-loopback X-Forwarded-For (proxy)', 'development', { host: 'localhost:3000', 'x-forwarded-for': '203.0.113.9' }],
    ['dev, cross-site browser request', 'development', { host: 'localhost:3000', 'x-forwarded-for': '::1', 'sec-fetch-site': 'cross-site' }],
  ])('not treated as local: %s → 403, no fetch', async (_name, nodeEnv, headers) => {
    setEnv({ NODE_ENV: nodeEnv });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}`, headers));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('unconfigured scanner still answers 503', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ALLOW_ANONYMOUS: 'true' });
    vi.stubEnv('SCANNER_KEY', '');
    const { GET } = await route();
    expect((await GET(req(`target=${PUBLIC_IP}`))).status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe('scanner: SSRF + scan-type allowlist unchanged for authorised callers', () => {
  const auth = { 'x-scanner-token': 'correct-horse' };

  it.each(['127.0.0.1', '169.254.169.254', '10.0.0.1', '::1', 'localhost', '2130706433'])('blocks internal target %s', async (target) => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    const res = await GET(req(`target=${encodeURIComponent(target)}`, auth));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Target blocked');
    expect(calls).toHaveLength(0);
  });

  it.each(['deep', 'ports', 'banner', 'traceroute', 'constructor'])('refuses restricted scan type %s', async (type) => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    const res = await GET(req(`target=${PUBLIC_IP}&type=${type}`, auth));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('missing target → 400', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ACCESS_TOKEN: 'correct-horse' });
    const { GET } = await route();
    expect((await GET(req('type=quick', auth))).status).toBe(400);
  });
});

describe('scanner: rate limit cannot be dodged with forged forwarding headers', () => {
  it('rotating X-Forwarded-For does not reset the limit when proxy headers are untrusted', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ALLOW_ANONYMOUS: 'true' });
    const { GET } = await route();
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const res = await GET(req(`target=${PUBLIC_IP}`, { 'x-forwarded-for': `198.51.100.${i}`, 'x-real-ip': `198.51.100.${i}` }));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('with TRUST_PROXY_HEADERS=true, distinct proxy-reported clients get separate buckets', async () => {
    setEnv({ NODE_ENV: 'production', SCANNER_ALLOW_ANONYMOUS: 'true', TRUST_PROXY_HEADERS: 'true' });
    const { GET } = await route();
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) {
      // client-forged first entry stays constant; the proxy-appended last entry varies
      const res = await GET(req(`target=${PUBLIC_IP}`, { 'x-forwarded-for': `1.1.1.1, 203.0.113.${i}` }));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
  });
});
