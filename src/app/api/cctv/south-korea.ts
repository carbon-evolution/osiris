import type { CctvCamera } from './types';

// ── South Korea Expressway + National Highway Cameras ──
// Source: ITS National Transport Information Center (국가교통정보센터) open API.
//   https://openapi.its.go.kr/api/NCCTVInfo  → CCTV coords + live HLS URLs.
// Requires a FREE API key — register at https://www.its.go.kr/opendata/ and set
// env `ITS_KR_KEY`. Without the key this returns [] (feature simply stays off).
//
// Params: type=ex (고속도로/expressway) | its (국도/national highway);
//   cctvType=1 (실시간 스트리밍 HLS); getType=json; bbox via minX/maxX/minY/maxY.
// Response: { response: { data: [ {coordx(lng), coordy(lat), cctvname, cctvurl(m3u8), cctvformat} ] } }
// NOTE: HLS streams load directly via hls.js. If a feed stays black due to CORS,
// add its host to HLS_PROXY_HOSTS in hls-hosts.ts (see the Indonesia precedent).

const CACHE_TTL_MS = 5 * 60 * 1000;
// National bounding box for the whole peninsula.
const BBOX = { minX: 124, maxX: 132, minY: 33, maxY: 43 };

async function fetchType(key: string, type: 'ex' | 'its'): Promise<CctvCamera[]> {
  const url =
    `https://openapi.its.go.kr/api/NCCTVInfo?apiKey=${encodeURIComponent(key)}` +
    `&type=${type}&cctvType=1&getType=json` +
    `&minX=${BBOX.minX}&maxX=${BBOX.maxX}&minY=${BBOX.minY}&maxY=${BBOX.maxY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'force-cache' });
    if (!res.ok) return [];
    const data: any = await res.json();
    const list: any[] = data?.response?.data ?? [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of list) {
      const lat: number = Number(c.coordy);
      const lng: number = Number(c.coordx);
      const stream: string = c.cctvurl || '';
      if (!lat || !lng || !stream) continue;
      // Stable id from coords + name (ITS has no persistent camera id field).
      const id = `${lat.toFixed(5)}-${lng.toFixed(5)}`;
      if (seen.has(id)) continue;
      seen.add(id);

      cameras.push({
        id: `kr-${type}-${id}`,
        lat,
        lng,
        name: c.cctvname || (type === 'ex' ? 'Expressway camera' : 'Highway camera'),
        city: '',
        country: 'South Korea',
        stream_url: stream,
        stream_type: 'hls',
        source: 'ITS Korea',
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
 * Fetch South Korea expressway + national-highway cameras from the ITS open API.
 * Requires free env key `ITS_KR_KEY`; returns [] if unset.
 */
export async function fetchSouthKoreaCameras(): Promise<CctvCamera[]> {
  const key = process.env.ITS_KR_KEY;
  if (!key) return [];
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const results = await Promise.allSettled([
    fetchType(key, 'ex'),
    fetchType(key, 'its'),
  ]);
  const all: CctvCamera[] = [];
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);

  // Dedup across the two endpoints by id.
  const seen = new Set<string>();
  const deduped = all.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  if (deduped.length > 0) {
    cached = deduped;
    cacheTs = Date.now();
  }
  return deduped;
}
