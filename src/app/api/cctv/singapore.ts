import type { CctvCamera } from './types';

// ── Singapore Traffic Cameras (no API key required) ──
// Source: data.gov.sg — Land Transport Authority (LTA) traffic-images dataset.
//   https://api.data.gov.sg/v1/transport/traffic-images  → ~90 cameras.
// Returns JSON: items[0].cameras[] = {camera_id, image, location:{latitude,longitude}, timestamp}.
// `image` is a fresh JPG snapshot on images.data.gov.sg (https, refreshed ~1-5 min).
// stream_type `jpg` — the frontend loads the image URL directly (no proxy needed).

const ENDPOINT = 'https://api.data.gov.sg/v1/transport/traffic-images';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Singapore traffic cameras from data.gov.sg (LTA).
 * No API key required — public JSON endpoint, ~90 cameras nationwide.
 */
export async function fetchSingaporeCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(ENDPOINT, {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return cached ?? [];

    const data: any = await res.json();
    const list: any[] = data?.items?.[0]?.cameras ?? [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of list) {
      const id: string = String(c.camera_id ?? '');
      const lat: number = c.location?.latitude;
      const lng: number = c.location?.longitude;
      const image: string = c.image || '';

      if (!id || !lat || !lng || !image) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      cameras.push({
        id: `sg-${id}`,
        lat,
        lng,
        name: `Camera ${id}`,
        city: 'Singapore',
        country: 'Singapore',
        feed_url: image,
        stream_url: image,
        stream_type: 'jpg',
        source: 'data.gov.sg LTA',
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
