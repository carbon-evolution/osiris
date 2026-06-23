import type { CctvCamera } from './types';

// ── Additional US State DOT camera APIs (no API key required) ──
// Sources confirmed working via curl verification:
//   Oregon/TripCheck  ~1,128 cams  —  tripcheck.com
//   Virginia/VDOT     ~1,693 cams  —  511.vdot.virginia.gov
//   Massachusetts     ~444   cams  —  MassDOT ArcGIS
//   Kentucky/KYTC     ~1,000 cams  —  KYTC ArcGIS (documented public)
//   Minnesota/MnDOT   ~200   cams  —  IRIS API (documented public)

// ── Module-level cache ──
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Oregon TripCheck ──
async function fetchOregonCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://tripcheck.com/Scripts/map/data/cctvinventory.js', {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = data?.features || [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const f of features) {
      const p = f.attributes || {};
      const lat = p.latitude;
      const lng = p.longitude;
      const filename: string = p.filename || '';
      const name: string = p.title || p.name || 'OR Highway Camera';

      if (!lat || !lng || !filename || seen.has(filename)) continue;
      seen.add(filename);

      cameras.push({
        id: `or-dot-${filename.replace(/[^a-zA-Z0-9]/g, '_')}`,
        lat, lng,
        name, city: p.route || p.city || '',
        country: 'United States',
        feed_url: `https://tripcheck.com/RoadCams/cams/${filename}`,
        source: 'Oregon DOT',
      });
    }
    return cameras;
  } catch { return []; }
}

// ── Virginia VDOT 511 ──
async function fetchVirginiaCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://511.vdot.virginia.gov/services/map/layers/map/cams', {
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
      const imgUrl: string = p.image_url || '';
      if (!lat || !lng || !imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      cameras.push({
        id: `va-dot-${f.id || p.name || imgUrl.split('/').pop()}`,
        lat, lng,
        name: p.name || p.description || 'VA Highway Camera',
        city: p.jurisdiction || p.description || '',
        country: 'United States',
        feed_url: imgUrl,
        stream_url: p.https_url || '',
        stream_type: p.https_url ? 'hls' : undefined,
        source: 'VDOT 511',
      });
    }
    return cameras;
  } catch { return []; }
}

// ── Massachusetts MassDOT ArcGIS ──
async function fetchMassachusettsCameras(): Promise<CctvCamera[]> {
  try {
    const url =
      'https://gisstg.massdot.state.ma.us/rh/rest/services/Hosted/MassDOT_Traffic_Cams/FeatureServer/0/query' +
      '?f=geojson&where=1%3D1&outFields=*&outSR=4326';
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'force-cache' });
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
      const imgUrl: string = p.fulljpeg || p.halfjpeg || p.hugejpeg || '';
      if (!lat || !lng || !imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      cameras.push({
        id: `ma-dot-${f.id || p.name || Math.random().toString(36).slice(2, 10)}`,
        lat, lng,
        name: p.name || p.description || 'MA Highway Camera',
        city: '',
        country: 'United States',
        feed_url: imgUrl,
        source: 'MassDOT',
      });
    }
    return cameras;
  } catch { return []; }
}

// ── Kentucky KYTC ArcGIS ──
async function fetchKentuckyCameras(): Promise<CctvCamera[]> {
  try {
    const url =
      'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_WebCams_WGS84WM/MapServer/0/query' +
      '?f=geojson&where=1%3D1&outFields=*&outSR=4326';
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'force-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = data?.features || [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const f of features) {
      const p = f.properties || {};
      const lat = p.latitude;
      const lng = p.longitude;
      const imgUrl: string = p.snapshot || '';
      if (!lat || !lng || !imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      cameras.push({
        id: `ky-dot-${f.id || p.name || Math.random().toString(36).slice(2, 10)}`,
        lat, lng,
        name: p.name || p.highway || 'KY Highway Camera',
        city: p.county || '',
        country: 'United States',
        feed_url: imgUrl,
        source: 'KYTC',
      });
    }
    return cameras;
  } catch { return []; }
}

// ── Minnesota MnDOT IRIS ──
async function fetchMinnesotaCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://iris.dot.state.mn.us/iris/api/camera_pub', {
      signal: AbortSignal.timeout(10000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const cam of data || []) {
      const lat = cam.lat;
      const lng = cam.lon;
      const imgUrl: string = cam.pub_url || '';
      if (!lat || !lng || !imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      cameras.push({
        id: `mn-dot-${cam.name || cam.id || Math.random().toString(36).slice(2, 10)}`,
        lat, lng,
        name: cam.name || 'MN Highway Camera',
        city: cam.roadway || cam.location || '',
        country: 'United States',
        feed_url: imgUrl,
        source: 'MnDOT',
      });
    }
    return cameras;
  } catch { return []; }
}

// ── Aggregator ──
let cached: CctvCamera[] | null = null;
let cacheTs = 0;

export async function fetchUSDotCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const results = await Promise.allSettled([
    fetchOregonCameras(),
    fetchVirginiaCameras(),
    fetchMassachusettsCameras(),
    fetchKentuckyCameras(),
    fetchMinnesotaCameras(),
  ]);

  const all: CctvCamera[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  cached = all;
  cacheTs = Date.now();
  return all;
}
