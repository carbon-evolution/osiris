import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

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
