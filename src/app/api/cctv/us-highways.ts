import type { CctvCamera } from './types';

// ── Source: OpenTrafficCamMap — 7,029 US highway cameras ──
// Free GitHub dataset, no API key needed
const OTCM_URL = 'https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json';

// ── Module-level cache ──
let cachedCameras: CctvCamera[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Simple string hash for IDs
function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Fetch US highway traffic cameras from OpenTrafficCamMap.
 * Covers: Alabama, Alaska, Arizona, California, Colorado, Delaware,
 * Georgia, Indiana, Kentucky, Ohio (~7k cameras).
 * No API key required. Caches for 5 minutes.
 */
export async function fetchUSHighwayCameras(): Promise<CctvCamera[]> {
  if (cachedCameras && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCameras;
  }

  try {
    const res = await fetch(OTCM_URL, {
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });

    if (!res.ok) {
      if (cachedCameras) return cachedCameras;
      return [];
    }

    const data = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const [stateName, regions] of Object.entries(data)) {
      if (!regions || typeof regions !== 'object') continue;

      for (const [regionName, cams] of Object.entries(regions as Record<string, unknown>)) {
        if (!Array.isArray(cams)) continue;

        for (const cam of cams) {
          const lat = cam.latitude;
          const lng = cam.longitude;
          const url: string = cam.url || '';
          const desc: string = cam.description || 'Highway Camera';

          if (!lat || !lng || !url) continue;

          // Dedup by URL
          if (seen.has(url)) continue;
          seen.add(url);

          const base: CctvCamera = {
            id: `us-hwy-${hashId(url)}`,
            lat,
            lng,
            name: desc,
            city: regionName,
            country: 'United States',
            source: `${stateName} DOT`,
          };

          // Classify URL type
          if (url.endsWith('.m3u8')) {
            base.stream_url = url;
            base.stream_type = 'hls';
          } else if (/\.(jpg|jpeg|png)(\?|$)/i.test(url)) {
            base.feed_url = url;
          } else {
            // Alaska/Arizona 511 URLs — return images
            base.feed_url = url;
          }

          cameras.push(base);
        }
      }
    }

    cachedCameras = cameras;
    cacheTimestamp = Date.now();
    return cameras;
  } catch (err) {
    console.error('us-highways fetch error:', err);
    if (cachedCameras) return cachedCameras;
    return [];
  }
}
