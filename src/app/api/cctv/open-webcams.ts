import type { CctvCamera } from './types';

// ── GeoJSON Source ──
// Live-Environment-Streams: 5,997 public webcams worldwide with coordinates
// No API key needed - fetched from GitHub raw
const GEOJSON_URL = 'https://raw.githubusercontent.com/willytop8/Live-Environment-Streams/main/streams.geojson';

// ── ISO 3166-1 alpha-2 → full country name ──
const COUNTRY_NAMES: Record<string, string> = {
  AL: 'Albania', AT: 'Austria', AU: 'Australia', BG: 'Bulgaria',
  BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CZ: 'Czechia',
  DE: 'Germany', EE: 'Estonia', ES: 'Spain', FI: 'Finland',
  FR: 'France', GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia',
  HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel',
  IT: 'Italy', JP: 'Japan', KG: 'Kyrgyzstan', KR: 'South Korea',
  KZ: 'Kazakhstan', LT: 'Lithuania', LV: 'Latvia', MT: 'Malta',
  MX: 'Mexico', MY: 'Malaysia', NG: 'Nigeria', NL: 'Netherlands',
  NO: 'Norway', NZ: 'New Zealand', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', RS: 'Serbia', RU: 'Russia',
  SE: 'Sweden', SG: 'Singapore', TH: 'Thailand', TR: 'Turkey',
  TT: 'Trinidad and Tobago', TW: 'Taiwan', US: 'United States',
  UY: 'Uruguay', VN: 'Vietnam', ZA: 'South Africa', XX: 'Unknown',
};

// ── YouTube URL → embed URL ──
function toEmbedUrl(url: string): string {
  // Already embed
  if (url.includes('/embed/')) return url;

  // youtube.com/watch?v=XXX
  const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=1&mute=1`;
  }

  // youtube.com/live/XXX
  const liveMatch = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
  if (liveMatch) {
    return `https://www.youtube.com/embed/${liveMatch[1]}?autoplay=1&mute=1`;
  }

  return url;
}

// ── Parse a GeoJSON feature into CctvCamera (or null if invalid) ──
function featureToCamera(feature: any): CctvCamera | null {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const lng = coords[0];
  const lat = coords[1];
  if (!lat || !lng) return null;

  const urlType: string = p.url_type || '';
  const rawUrl: string = p.url || '';
  const name: string = p.display_name || p.name || 'Webcam';
  const countryCode: string = p.country_code || 'XX';
  const sourceFamily: string = p.source_family || 'unknown';
  const coordQuality: string = p.coordinates_quality || 'country_centroid';
  const status: string = p.status || 'unknown';

  // Skip inactive
  if (status !== 'active') return null;

  // Skip low-accuracy coordinates
  if (coordQuality === 'country_centroid') return null;

  // Build the camera object based on URL type
  const camera: CctvCamera = {
    id: `owc-${Buffer.from(rawUrl).toString('base64').slice(0, 20)}`,
    lat,
    lng,
    name,
    city: p.city || p.region || '',
    country: COUNTRY_NAMES[countryCode] || countryCode,
    source: sourceFamily,
  };

  if (urlType === 'hls') {
    camera.stream_url = rawUrl;
    camera.stream_type = 'hls';
  } else if (urlType === 'youtube') {
    camera.stream_url = toEmbedUrl(rawUrl);
    camera.stream_type = 'iframe';
  } else if (urlType === 'html_page') {
    camera.external_url = rawUrl;
  } else {
    // Unknown type, skip if no usable URL
    if (!rawUrl) return null;
    camera.external_url = rawUrl;
  }

  // Must have at least one usable URL to be useful
  if (!camera.feed_url && !camera.stream_url && !camera.external_url) return null;

  return camera;
}

// ── Module-level cache ──
let cachedCameras: CctvCamera[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch publicly accessible webcams from Live-Environment-Streams GeoJSON.
 * No API key required. Caches results for 5 minutes.
 */
export async function fetchOpenWebcams(): Promise<CctvCamera[]> {
  // Return cache if fresh
  if (cachedCameras && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCameras;
  }

  try {
    const res = await fetch(GEOJSON_URL, {
      signal: AbortSignal.timeout(15000),
      // GitHub CDN handles edge caching
      cache: 'force-cache',
    });

    if (!res.ok) {
      // Fall back to cache if stale
      if (cachedCameras) return cachedCameras;
      return [];
    }

    const data = await res.json();
    const features: any[] = data?.features || [];

    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const feature of features) {
      const cam = featureToCamera(feature);
      if (!cam) continue;

      // Deduplicate by coordinates + URL
      const key = `${cam.lat.toFixed(2)}-${cam.lng.toFixed(2)}-${cam.stream_url || cam.external_url || cam.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      cameras.push(cam);
    }

    // Update cache
    cachedCameras = cameras;
    cacheTimestamp = Date.now();

    return cameras;
  } catch (err) {
    console.error('open-webcams fetch error:', err);
    // Fall back to cache
    if (cachedCameras) return cachedCameras;
    return [];
  }
}

/**
 * Fetch webcams filtered by country code.
 */
export async function fetchOpenWebcamsByCountry(countryCode: string): Promise<CctvCamera[]> {
  const all = await fetchOpenWebcams();
  return all.filter((cam) => {
    const code = Object.entries(COUNTRY_NAMES).find(
      ([, name]) => name === cam.country
    )?.[0];
    return code === countryCode;
  });
}
