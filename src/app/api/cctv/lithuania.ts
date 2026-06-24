import type { CctvCamera } from './types';

// ── Lithuania Road Cameras (no API key required) ──
// Source: Lietuvos automobilių kelių direkcija — eismoinfo.lt.
//   https://eismoinfo.lt/eismoinfo-backend/camera-info-table  → ~310 cameras.
// Fields: {id, name, roadName, roadNr, image, x, y, km}. Coordinates x/y are in
// LKS94 / EPSG:3346 (projected metres) — converted to WGS84 below.
// The image endpoint (image-provider/camera/last?id=) returns a JPG but 403s
// without a Referer, so these are marked stream_type 'mjpeg' to route through
// /api/cctv/proxy, which sends the required Referer (see proxy/route.ts).

const ENDPOINT = 'https://eismoinfo.lt/eismoinfo-backend/camera-info-table';
const CACHE_TTL_MS = 5 * 60 * 1000;

// Inverse Transverse Mercator: LKS94 (EPSG:3346) easting/northing → [lat, lng].
// GRS80 ellipsoid, central meridian 24°E, k0=0.9998, false easting 500000.
function lks94ToWgs84(E: number, N: number): [number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const k0 = 0.9998;
  const lon0 = (24.0 * Math.PI) / 180;
  const FE = 500000.0;
  const FN = 0.0;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);

  const M = (N - FN) / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const C1 = ep2 * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (E - FE) / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D ** 2) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Lithuania (eismoinfo.lt) road cameras. No API key required — ~310 cams.
 */
export async function fetchLithuaniaCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(ENDPOINT, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return cached ?? [];
    const list: any[] = await res.json();

    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of list) {
      const id: string = String(c?.id ?? '');
      const x: number = Number(c?.x);
      const y: number = Number(c?.y);
      const image: string = c?.image || '';
      if (!id || !x || !y || !image) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const [lat, lng] = lks94ToWgs84(x, y);
      if (lat < 53 || lat > 57 || lng < 20 || lng > 27) continue; // sanity bounds

      cameras.push({
        id: `lt-${id}`,
        lat,
        lng,
        name: c.name || 'Eismo camera',
        city: c.roadName || '',
        country: 'Lithuania',
        feed_url: image,
        stream_url: image,
        // Marked mjpeg so the frontend routes via the proxy (Referer needed).
        stream_type: 'mjpeg',
        source: 'eismoinfo.lt',
      });
    }

    if (cameras.length > 0) {
      cached = cameras;
      cacheTs = Date.now();
    }
    return cameras.length > 0 ? cameras : (cached ?? []);
  } catch {
    return cached ?? [];
  }
}
