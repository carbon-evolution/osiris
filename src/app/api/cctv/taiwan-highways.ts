import type { CctvCamera } from './types';

// ── Taiwan Freeway + Provincial Highway Cameras (no API key required) ──
// Source: Taiwan Highway Bureau (THB) — 交通部公路局
//   Freeway (國道)   ~1,779 cams  —  https://thbapp.thb.gov.tw/services/cctv/freeway
//   Provincial (省道) ~2,149 cams  —  https://thbapp.thb.gov.tw/services/cctv/thb
// Both return clean JSON with id, coordinates (gisx/gisy), stakenumber, and html stream URL.
// County/city cameras endpoint (https://thbapp.thb.gov.tw/services/cctv/county) currently returns empty.

const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchEndpoint(url: string, prefix: string): Promise<CctvCamera[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of data) {
      const id: string = c.id || '';
      const lat: number = c.gisy;
      const lng: number = c.gisx;
      // THB returns some hosts (e.g. cctvs.freeway.gov.tw) as http://, but they
      // only answer over https — plain http connections are refused. Upgrade so
      // the proxy can reach them.
      const streamUrl: string = (c.html || '').replace(/^http:\/\//i, 'https://');

      if (!id || !lat || !lng) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      // Parse road name from stakenumber (e.g. "國道1號(基隆端到基隆交流道)" or "台1線28K+500")
      const road: string = c.stakenumber || '';
      const name = road.split('(')[0] || road;

      cameras.push({
        id: `tw-${prefix}-${id}`,
        lat, lng,
        name: name,
        city: '',
        country: 'Taiwan',
        feed_url: streamUrl,
        stream_url: streamUrl,
        stream_type: 'mjpeg',
        source: 'THB Taiwan',
      });
    }
    return cameras;
  } catch {
    return [];
  }
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Taiwan highway traffic cameras from the Taiwan Highway Bureau (THB).
 * Sources: freeway (國道, ~1,779 cameras) + provincial (省道, ~2,149 cameras).
 * No API key required — public JSON endpoints.
 */
export async function fetchTaiwanHighwayCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const results = await Promise.allSettled([
    fetchEndpoint('https://thbapp.thb.gov.tw/services/cctv/freeway', 'freeway'),
    fetchEndpoint('https://thbapp.thb.gov.tw/services/cctv/thb', 'prov'),
  ]);

  const all: CctvCamera[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Deduplicate by lat/lng/name proximity (rough dedup — if same lat/lng and road name, keep one)
  const seen = new Set<string>();
  const deduped: CctvCamera[] = [];
  for (const c of all) {
    const key = `${c.lat.toFixed(3)}-${c.lng.toFixed(3)}-${c.name.slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  cached = deduped;
  cacheTs = Date.now();
  return deduped;
}
