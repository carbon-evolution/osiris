import type { CctvCamera } from './types';

// ── Ireland Motorway/National Road Cameras (no API key required) ──
// Source: Transport Infrastructure Ireland (TII) Traffic map — CC BY 4.0.
//   GraphQL: POST https://traffic.tii.ie/api/graphql  (operation MapFeatures).
// Returns ~240 cameras nationwide; each feature has a Point geometry
// ([lng, lat]) and an IMAGE view URL (JPG snapshot on irecam.carsprogram.org,
// https → loads directly in the frontend, no proxy needed). stream_type 'jpg'.

const ENDPOINT = 'https://traffic.tii.ie/api/graphql';
const CACHE_TTL_MS = 5 * 60 * 1000;

// National bbox + high zoom so the server returns individual cameras (no clusters).
const QUERY = {
  query:
    'query MapFeatures($input: MapFeaturesArgs!) { mapFeaturesQuery(input: $input) ' +
    '{ mapFeatures { uri title __typename features { geometry } ' +
    '... on Camera { active views(limit: 5) { category ... on CameraView { url } } } } } }',
  variables: {
    input: {
      north: 55.5,
      south: 51.3,
      east: -5.9,
      west: -10.7,
      zoom: 18,
      layerSlugs: ['normalCameras'],
    },
  },
};

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Ireland (TII) traffic cameras via the public GraphQL map API.
 * No API key required — ~240 cameras, JPG snapshots.
 */
export async function fetchIrelandCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(QUERY),
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });
    if (!res.ok) return cached ?? [];

    const data: any = await res.json();
    const list: any[] = data?.data?.mapFeaturesQuery?.mapFeatures ?? [];
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const f of list) {
      if (f?.__typename !== 'Camera' || f?.active === false) continue;

      const coords = f?.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!lat || !lng) continue;

      const view = (f?.views ?? []).find((v: any) => v?.category === 'IMAGE' && v?.url);
      const image: string = view?.url || '';
      if (!image) continue;

      const id: string = String(f.uri || `${lat},${lng}`);
      if (seen.has(id)) continue;
      seen.add(id);

      cameras.push({
        id: `ie-${id.replace(/\//g, '-')}`,
        lat,
        lng,
        name: f.title || 'TII camera',
        city: '',
        country: 'Ireland',
        feed_url: image,
        stream_url: image,
        stream_type: 'jpg',
        source: 'TII Ireland',
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
