import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

// Each test stubs global fetch and records the URLs routes try to reach.
let calls: { url: string; init?: RequestInit }[] = [];
function stubFetch(respond: (url: string) => Response = () => Response.json({})) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return respond(url);
  }));
}
beforeEach(() => stubFetch());
afterEach(() => vi.unstubAllGlobals());

describe('stats: internal fetches ignore the request Host header', () => {
  it('calls this server, not the host a client claims', async () => {
    const { GET } = await import('./stats/route');
    await GET();
    expect(calls.length).toBe(6);
    const port = process.env.PORT || 3000;
    for (const c of calls) expect(c.url.startsWith(`http://127.0.0.1:${port}/api/`)).toBe(true);
  });
});

describe('flight/enrich: only real callsign / icao24 shapes reach adsbdb', () => {
  it('rejects a path-injection icao24 without fetching', async () => {
    const { GET } = await import('./flight/enrich/route');
    const res = await GET(new Request('http://x/api/flight/enrich?icao24=abc123/../../v0/x'));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('skips a callsign carrying query/fragment characters', async () => {
    const { GET } = await import('./flight/enrich/route');
    await GET(new Request('http://x/api/flight/enrich?callsign=' + encodeURIComponent('BAW283?admin=1#x')));
    expect(calls.some(c => c.url.includes('/callsign/'))).toBe(false);
  });

  it('still looks up valid values', async () => {
    const { GET } = await import('./flight/enrich/route');
    await GET(new Request('http://x/api/flight/enrich?callsign=BAW283&icao24=ABC123'));
    expect(calls.map(c => c.url)).toEqual(expect.arrayContaining([
      'https://api.adsbdb.com/v0/callsign/BAW283',
      'https://api.adsbdb.com/v0/aircraft/abc123',
    ]));
  });
});

describe('cctv: region names must be own keys', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])('?region=%s returns no cameras', async (region) => {
    const { GET } = await import('./cctv/route');
    const res = await GET(new Request(`http://x/api/cctv?region=${region}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.regions).toEqual([]);
  });
});

describe('temperature/tile: only real tiles are accepted and cached', () => {
  const tileFile = (date: string) => path.join(process.cwd(), '.cache', 'tiles', 'sst', date, '2', '1', '1.png');

  it.each([
    ['layer=constructor&date=2026-01-01&z=2&x=1&y=1'],
    ['layer=sst&date=notadate&z=2&x=1&y=1'],
    ['layer=sst&date=2026-01-01&z=8&x=0&y=0'],
    ['layer=sst&date=2026-01-01&z=2&x=4&y=1'],
    ['layer=sst&date=2026-01-01&z=2&x=1&y=abc'],
  ])('400 for %s', async (qs) => {
    const { GET } = await import('./temperature/tile/route');
    const res = await GET(new Request(`http://x/api/temperature/tile?${qs}`));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('does not write upstream no-data tiles to disk', async () => {
    const date = '1999-01-01';
    rmSync(path.dirname(path.dirname(path.dirname(tileFile(date)))), { recursive: true, force: true });
    stubFetch(() => new Response('', { status: 404 }));
    const { GET } = await import('./temperature/tile/route');
    const res = await GET(new Request(`http://x/api/temperature/tile?layer=sst&date=${date}&z=2&x=1&y=1`));
    expect(res.status).toBe(200);
    expect(existsSync(tileFile(date))).toBe(false);
  });

  it('caches real tiles', async () => {
    const date = '1999-01-02';
    stubFetch(() => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));
    const { GET } = await import('./temperature/tile/route');
    await GET(new Request(`http://x/api/temperature/tile?layer=sst&date=${date}&z=2&x=1&y=1`));
    expect(existsSync(tileFile(date))).toBe(true);
    rmSync(path.dirname(path.dirname(path.dirname(tileFile(date)))), { recursive: true, force: true });
  });
});

describe('proxy-tiles: stays on cartocdn.com', () => {
  it('refuses redirects', async () => {
    const { GET } = await import('./proxy-tiles/route');
    await GET(new NextRequest('http://x/api/proxy-tiles?url=' + encodeURIComponent('https://a.basemaps.cartocdn.com/x.png')));
    expect(calls[0].init?.redirect).toBe('error');
  });

  it('403 for other hosts', async () => {
    const { GET } = await import('./proxy-tiles/route');
    const res = await GET(new NextRequest('http://x/api/proxy-tiles?url=' + encodeURIComponent('https://cartocdn.com.evil.example/x.png')));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe('geo: Vercel location headers are trusted only on Vercel', () => {
  const vercelHeaders = { 'x-vercel-ip-latitude': '1.5', 'x-vercel-ip-longitude': '2.5', 'x-vercel-ip-city': 'Fake%20City' };
  afterEach(() => { delete process.env.VERCEL; });

  it('ignores client-supplied x-vercel-ip-* headers off Vercel', async () => {
    stubFetch(() => new Response('', { status: 503 })); // external providers down
    const { GET } = await import('./geo/route');
    const body = await (await GET(new NextRequest('http://x/api/geo', { headers: vercelHeaders }))).json();
    expect(body.source).not.toBe('vercel');
    expect(body.lat).not.toBe(1.5);
    expect(calls.length).toBeGreaterThan(0); // fell through to the external lookups
  });

  it('uses them when VERCEL=1', async () => {
    process.env.VERCEL = '1';
    const { GET } = await import('./geo/route');
    const body = await (await GET(new NextRequest('http://x/api/geo', { headers: vercelHeaders }))).json();
    expect(body).toMatchObject({ source: 'vercel', lat: 1.5, lon: 2.5, city: 'Fake City' });
    expect(calls).toHaveLength(0);
  });
});

describe('cctv/denmark-official: camera keys must be own keys', () => {
  it.each(['constructor', 'toString', '__proto__', '9'])('?cam=%s is a 400 without fetching', async (cam) => {
    const { GET } = await import('./cctv/denmark-official/route');
    const res = await GET(new NextRequest(`http://x/api/cctv/denmark-official?cam=${cam}`));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('github-webhook: verified relay to a configured target only', () => {
  const body = JSON.stringify({ action: 'opened' });
  const sign = (secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const post = (headers: Record<string, string> = {}, payload = body) =>
    new Request('http://x/api/github-webhook', { method: 'POST', headers, body: payload });
  afterEach(() => { delete process.env.GITHUB_WEBHOOK_SECRET; delete process.env.GITHUB_WEBHOOK_FORWARD_URL; });

  it.each([
    ['nothing set (previously relayed anonymously to a hardcoded internal IP)', {}],
    ['secret only (no target configured)', { GITHUB_WEBHOOK_SECRET: 's3cret' }],
    ['URL only (previously: no secret = no signature check)', { GITHUB_WEBHOOK_FORWARD_URL: 'http://bot.internal:3005/github/webhook' }],
  ])('503 and no forward when %s', async (_label, env) => {
    Object.assign(process.env, env);
    const { POST } = await import('./github-webhook/route');
    const res = await POST(post({ 'x-hub-signature-256': 'sha256=whatever' }));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  describe('when configured', () => {
    beforeEach(() => {
      process.env.GITHUB_WEBHOOK_SECRET = 's3cret';
      process.env.GITHUB_WEBHOOK_FORWARD_URL = 'http://bot.internal:3005/github/webhook';
    });

    it('401 without a signature', async () => {
      const { POST } = await import('./github-webhook/route');
      expect((await POST(post())).status).toBe(401);
      expect(calls).toHaveLength(0);
    });

    it('401 with a wrong signature', async () => {
      const { POST } = await import('./github-webhook/route');
      expect((await POST(post({ 'x-hub-signature-256': sign('wrong') }))).status).toBe(401);
      expect(calls).toHaveLength(0);
    });

    it('forwards a correctly signed payload to the configured URL', async () => {
      const { POST } = await import('./github-webhook/route');
      const res = await POST(post({ 'x-hub-signature-256': sign('s3cret') }));
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://bot.internal:3005/github/webhook');
      expect(calls[0].init?.body).toBe(body);
      expect(calls[0].init?.signal).toBeDefined();
    });

    it('rejects a signed non-JSON body without forwarding', async () => {
      const { POST } = await import('./github-webhook/route');
      const raw = 'not json';
      const sig = 'sha256=' + createHmac('sha256', 's3cret').update(raw).digest('hex');
      const res = await POST(post({ 'x-hub-signature-256': sig }, raw));
      expect(res.status).toBe(500);
      expect(calls).toHaveLength(0);
    });
  });
});
