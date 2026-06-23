import type { CctvCamera } from './types';
import { inferStreamType } from './types';

// ── Caltrans CWWP2 CCTV Cameras (no API key required) ──
// Source: California Department of Transportation CWWP2
//   ~3,000 cameras across 12 Caltrans districts
//   https://cwwp2.dot.ca.gov/
// Each district has a JSON endpoint returning camera metadata + JPG snapshots.
// Some cameras also provide HLS streams via streamingVideoURL.

const CACHE_TTL_MS = 5 * 60 * 1000;

const DISTRICT_URLS = Array.from({ length: 12 }, (_, i) => {
  const d = i + 1;
  const dd = String(d).padStart(2, '0');
  return {
    district: d,
    url: `https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${dd}.json`,
  };
});

interface CaltransCamera {
  index: string;
  location: {
    district: string;
    locationName: string;
    nearbyPlace: string;
    longitude: string;
    latitude: string;
    direction: string;
    county: string;
    route: string;
  };
  inService: string;
  imageData: {
    streamingVideoURL: string;
    static: {
      currentImageURL: string;
    };
  };
}

interface CaltransResponse {
  data: Array<{ cctv: CaltransCamera }>;
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

async function fetchDistrictCameras(district: number, url: string): Promise<CctvCamera[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });

    if (!res.ok) return [];

    const body: CaltransResponse = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const item of body.data ?? []) {
      const cam = item.cctv;
      if (!cam) continue;

      const lat = parseFloat(cam.location.latitude);
      const lng = parseFloat(cam.location.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      const inService = cam.inService?.toLowerCase() === 'true';
      if (!inService) continue;

      const name = cam.location.locationName || `Caltrans D${district} Camera ${cam.index}`;
      const imgUrl = cam.imageData?.static?.currentImageURL || '';
      const streamUrl = cam.imageData?.streamingVideoURL || '';

      // Deduplicate by coordinates + image URL (same location may have multiple direction cams)
      const dedupKey = `${lat.toFixed(4)}-${lng.toFixed(4)}-${imgUrl}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      if (!imgUrl) continue;

      cameras.push({
        id: `caltrans-d${district}-${cam.index}`,
        lat,
        lng,
        name,
        city: cam.location.nearbyPlace || cam.location.county || '',
        country: 'United States',
        feed_url: imgUrl,
        stream_url: streamUrl || undefined,
        stream_type: streamUrl ? inferStreamType(streamUrl) : undefined,
        source: 'Caltrans',
      });
    }

    return cameras;
  } catch {
    return [];
  }
}

export async function fetchCaltransCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    // Fetch all 12 districts in parallel
    const results = await Promise.all(
      DISTRICT_URLS.map((d) => fetchDistrictCameras(d.district, d.url))
    );

    cached = results.flat();
    cacheTs = Date.now();
    return cached;
  } catch {
    cached = [];
    cacheTs = Date.now();
    return [];
  }
}
