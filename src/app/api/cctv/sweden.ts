import type { CctvCamera } from './types';

// ── Sweden Traffic Cameras (Trafikverket) ──
// Source: Trafikverket open data API (national road authority).
//   POST https://api.trafikinfo.trafikverket.se/v2/data.json  (XML query body).
// Requires a FREE API key — register at https://api.trafikinfo.trafikverket.se/
// and set env `TRAFIKVERKET_KEY`. Without the key this returns [].
//
// Query objecttype="Camera"; response:
//   RESPONSE.RESULT[0].Camera[] = { Id, Name, Geometry:{WGS84:"POINT (lng lat)"}, PhotoUrl }
// PhotoUrl is a JPG snapshot → stream_type 'jpg' (loaded directly by the frontend).

const ENDPOINT = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const CACHE_TTL_MS = 5 * 60 * 1000;

// "POINT (lng lat)" → [lat, lng]
function parsePoint(wgs84: string): [number, number] | null {
  const m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(wgs84 || '');
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!lat || !lng) return null;
  return [lat, lng];
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Sweden traffic cameras from Trafikverket.
 * Requires free env key `TRAFIKVERKET_KEY`; returns [] if unset.
 */
export async function fetchSwedenCameras(): Promise<CctvCamera[]> {
  const key = process.env.TRAFIKVERKET_KEY;
  if (!key) return [];
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const body =
    `<REQUEST>` +
    `<LOGIN authenticationkey="${key}"/>` +
    `<QUERY objecttype="Camera" schemaversion="1">` +
    `<FILTER><EQ name="Active" value="true"/></FILTER>` +
    `<INCLUDE>Id</INCLUDE><INCLUDE>Name</INCLUDE>` +
    `<INCLUDE>Geometry.WGS84</INCLUDE><INCLUDE>PhotoUrl</INCLUDE>` +
    `</QUERY></REQUEST>`;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body,
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return cached ?? [];

    const data: any = await res.json();
    const list: any[] = data?.RESPONSE?.RESULT?.[0]?.Camera ?? [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of list) {
      const id: string = String(c.Id ?? '');
      const photo: string = c.PhotoUrl || '';
      const coords = parsePoint(c.Geometry?.WGS84);
      if (!id || !photo || !coords) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      // Trafikverket PhotoUrl is a permalink; append /image to get the JPG.
      const image = photo.endsWith('/image') ? photo : `${photo}/image`;

      cameras.push({
        id: `se-${id}`,
        lat: coords[0],
        lng: coords[1],
        name: c.Name || 'Trafikverket camera',
        city: '',
        country: 'Sweden',
        feed_url: image,
        stream_url: image,
        stream_type: 'jpg',
        source: 'Trafikverket',
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
