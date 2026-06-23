import type { CctvCamera } from './types';
import proj4 from 'proj4';

// ── Estonia Traffic Cameras (no API key required) ──
// Sources:
//   A) Estonian Road Administration — Transpordiamet TarkTee  (~100 cams via nordapi.ee)
//      Endpoint: https://nordapi.ee/api/v1/estonian-roads/cameras
//      Coords: L-EST97 (EPSG:3301) — converted to WGS84 via proj4
//      Images: https://tarktee.mnt.ee/images/{id}/{id}_{timestamp}.jpg
//   B) Tallinn City Intersection Cameras  (~255 cams)
//      Endpoint: https://nordapi.ee/api/v1/tallinn/cameras
//      No coordinates available — approximated from city center
//      Images: https://ristmikud.tallinn.ee/last/cam{ID}.jpg

const CACHE_TTL_MS = 5 * 60 * 1000;

// Estonia's road cameras use a custom Transverse Mercator projection
// (L-EST97 variant with lat_0=0 — northing measured from equator, like UTM):
//   Central meridian: 24°E, Scale factor: 0.9996
//   False easting: 500,000m, False northing: 0
//   Ellipsoid: GRS80 (functionally equivalent to WGS84)
const PROJ_ESTONIA =
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
proj4.defs('ESTONIA_ROADS', PROJ_ESTONIA);
const wgs84 = 'EPSG:4326';
const estProj = 'ESTONIA_ROADS';

interface EstoniaRoadCamera {
  id: number;
  name: string;
  latitude: number;   // L-EST97 Northing
  longitude: number;  // L-EST97 Easting
  image_url: string;
  road_status?: string;
  road_temp?: number;
  air_temp?: number;
  closest_weather_station?: string;
  image_time?: string;
  calibration?: {
    direction?: string;
    azimuth_deg?: number;
  };
}

interface EstoniaApiResponse {
  count: number;
  data: EstoniaRoadCamera[];
  success: boolean;
}

interface TallinnCamera {
  id: string;
  name: string;
  image_url: string;
  has_restrictions?: boolean;
  calibration?: {
    direction?: string;
    azimuth_deg?: number;
  };
}

interface TallinnApiResponse {
  count: number;
  data: TallinnCamera[];
  success: boolean;
  area?: string;
}

// ── A) Estonian Road Cameras ──
async function fetchEstoniaRoadCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://nordapi.ee/api/v1/estonian-roads/cameras', {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];

    const body: EstoniaApiResponse = await res.json();
    const camerasList = body?.data;
    if (!Array.isArray(camerasList)) return [];

    const cameras: CctvCamera[] = [];
    const seen = new Set<number>();

    for (const cam of camerasList) {
      const id = cam.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      // Convert projected coords → WGS84
      const wgs = proj4(estProj, wgs84, [cam.longitude, cam.latitude]);
      const lng = wgs[0];
      const lat = wgs[1];

      if (isNaN(lat) || isNaN(lng)) continue;

      const direction = cam.calibration?.direction || '';

      cameras.push({
        id: `ee-road-${id}`,
        lat,
        lng,
        name: cam.name || `Estonia Road Camera ${id}`,
        city: cam.closest_weather_station || '',
        country: 'Estonia',
        feed_url: cam.image_url,
        stream_type: 'jpg',
        source: 'TarkTee',
      });
    }

    return cameras;
  } catch {
    return [];
  }
}

// ── B) Tallinn City Cameras (no coordinates — assign city centroid) ──
const TALLINN_CENTER_LAT = 59.437;
const TALLINN_CENTER_LNG = 24.7536;
// Spread radius (~10 km) so markers don't all overlap
const TALLINN_SPREAD_RADIUS = 0.09;

async function fetchTallinnCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch('https://nordapi.ee/api/v1/tallinn/cameras', {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];

    const body: TallinnApiResponse = await res.json();
    const camerasList = body?.data;
    if (!Array.isArray(camerasList)) return [];

    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();
    const step = 0.005; // small jitter to spread overlapping markers

    for (let i = 0; i < camerasList.length; i++) {
      const cam = camerasList[i];
      const id = cam.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      // Spread cameras around Tallinn to avoid all stacking on one point
      const angle = (i * 37) % 360; // prime-based spread
      const radius = TALLINN_SPREAD_RADIUS * (0.3 + 0.7 * ((i * 17) % 100) / 100);
      const offsetLat = radius * Math.cos((angle * Math.PI) / 180);
      const offsetLng = radius * Math.sin((angle * Math.PI) / 180);

      cameras.push({
        id: `ee-tallinn-${id}`,
        lat: TALLINN_CENTER_LAT + offsetLat,
        lng: TALLINN_CENTER_LNG + offsetLng,
        name: cam.name || `Tallinn Camera ${id}`,
        city: 'Tallinn',
        country: 'Estonia',
        feed_url: cam.image_url,
        stream_type: 'jpg',
        source: 'Tallinn City',
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

export async function fetchEstoniaCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  const results = await Promise.allSettled([
    fetchEstoniaRoadCameras(),
    fetchTallinnCameras(),
  ]);

  const all: CctvCamera[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  cached = all;
  cacheTs = Date.now();
  return all;
}
