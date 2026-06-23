import type { CctvCamera } from './types';

// ── International Highway Camera Sources (no API key required) ──
// Confirmed zero-auth:
//   Finland (Fintraffic/Digitraffic)  ~470 cams  —  tie.digitraffic.fi
//   Portugal (Infraestruturas IP)     ~200 cams  —  sigip.infraestruturasdeportugal.pt

const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Finland: Fintraffic Digitraffic Weathercams (~470) ──
async function fetchFinlandCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations', {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = data?.features || [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [lng, lat] = coords;
      const stationId: string = p.id || '';
      if (!lat || !lng || !stationId || seen.has(stationId)) continue;
      seen.add(stationId);

      // Build image URL from first preset
      const presets: any[] = p.presets || [];
      const firstPreset = presets[0];
      const imgUrl = firstPreset
        ? `https://weathercam.digitraffic.fi/${firstPreset.id}.jpg`
        : '';

      cameras.push({
        id: `fi-digi-${stationId}`,
        lat, lng,
        name: p.name || p.nameFi || p.nameSe || `FI Camera ${stationId}`,
        city: p.nearestWeatherStationName || '',
        country: 'Finland',
        feed_url: imgUrl,
        source: 'Fintraffic',
      });
    }
    return cameras;
  } catch {
    return [];
  }
}

// ── Portugal: Infraestruturas de Portugal ArcGIS (~200) ──
async function fetchPortugalCameras(): Promise<CctvCamera[]> {
  try {
    const url =
      'https://sigip.infraestruturasdeportugal.pt/pub/rest/services/SITE_EXTERNO_IP/viajar_na_estrada2021/MapServer/3/query' +
      '?f=json&where=1%3D1&outFields=*&outSR=4326&returnGeometry=true';
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'force-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = data?.features || [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const f of features) {
      const a = f.attributes || {};
      const coords = f.geometry?.coordinates || f.geometry?.rings?.[0]?.[0];
      let lng: number, lat: number;

      if (Array.isArray(coords) && coords.length >= 2) {
        lng = coords[0];
        lat = coords[1];
      } else if (a.longitude && a.latitude) {
        lng = a.longitude;
        lat = a.latitude;
      } else {
        continue;
      }

      const imgUrl: string = a.url1 || a.url || '';
      if (!lat || !lng || !imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      cameras.push({
        id: `pt-ip-${a.objectid || Math.random().toString(36).slice(2, 10)}`,
        lat, lng,
        name: a.descricao || a.estrada || 'PT Highway Camera',
        city: a.localidade || '',
        country: 'Portugal',
        feed_url: imgUrl,
        source: 'IP Portugal',
      });
    }
    return cameras;
  } catch {
    return [];
  }
}

// ── Aggregator ──
let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch international highway traffic cameras from confirmed zero-auth sources.
 * Currently covers: Finland (Fintraffic) ~470 cameras, Portugal (IP) ~200 cameras.
 */
export async function fetchIntlHighwayCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const results = await Promise.allSettled([
    fetchFinlandCameras(),
    fetchPortugalCameras(),
  ]);

  const all: CctvCamera[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  cached = all;
  cacheTs = Date.now();
  return all;
}
