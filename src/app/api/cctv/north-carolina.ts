import type { CctvCamera } from './types';
import { inferStreamType } from './types';

// ── North Carolina DOT Traffic Cameras (no API key required) ──
// Source: NCDOT ArcGIS FeatureServer
//   ~1,109 cameras — https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_Cameras/FeatureServer/0
// Returns ArcGIS JSON with features array, each containing camera attributes.
// Snapshot URL format: https://cfms.services.ncdot.gov/snapshots/chan-{id}_l.jpg
// HLS stream available via videoHlsUri field.

const CACHE_TTL_MS = 5 * 60 * 1000;

interface ArcGisFeature {
  attributes: {
    cameraId: number;
    name?: string;
    locationName?: string;
    latitude: number;
    longitude: number;
    highway?: string;
    direction?: string;
    county?: string;
    snapshotAddress?: string;
    videoHlsUri?: string;
    cameraStatus?: string;
  };
}

interface ArcGisResponse {
  features: ArcGisFeature[];
}

const ACTIVE_STATUSES = new Set(['Active', 'Online', 'Enabled']);

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch North Carolina DOT traffic cameras from the public ArcGIS FeatureServer.
 * Returns ~1,109 cameras with snapshot images and optional HLS streams.
 * No API key required — public JSON endpoint.
 */
export async function fetchNorthCarolinaCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const url =
      'https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_Cameras/FeatureServer/0/query' +
      '?where=1%3D1&outFields=*&f=json&resultRecordCount=2000';

    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });

    if (!res.ok) {
      cached = [];
      cacheTs = Date.now();
      return [];
    }

    const data: ArcGisResponse = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<number>();

    for (const feature of data.features ?? []) {
      const attrs = feature.attributes;
      if (!attrs) continue;

      const cameraId = attrs.cameraId;
      const lat = attrs.latitude;
      const lng = attrs.longitude;
      const status = attrs.cameraStatus;

      // Skip invalid or missing data
      if (!cameraId || typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (status && !ACTIVE_STATUSES.has(status)) continue;
      if (seen.has(cameraId)) continue;
      seen.add(cameraId);

      // Build name from highway + direction or use the provided name
      const name =
        attrs.name ||
        attrs.locationName ||
        [attrs.highway, attrs.direction].filter(Boolean).join(' ') ||
        `NCDOT Camera ${cameraId}`;

      const streamUrl = attrs.videoHlsUri || '';

      cameras.push({
        id: `nc-${cameraId}`,
        lat,
        lng,
        name,
        city: attrs.county || '',
        country: 'United States',
        feed_url: attrs.snapshotAddress || '',
        stream_url: streamUrl || undefined,
        stream_type: streamUrl ? inferStreamType(streamUrl) : undefined,
        source: 'NCDOT',
      });
    }

    cached = cameras;
    cacheTs = Date.now();
    return cameras;
  } catch {
    cached = [];
    cacheTs = Date.now();
    return [];
  }
}
