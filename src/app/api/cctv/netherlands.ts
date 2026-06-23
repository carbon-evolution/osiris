import type { CctvCamera } from './types';

// ── Netherlands: Rijkswaterstaat Verkeerscamera's (no API key required) ──
// Source: Rijkswaterstaat Verkeersinformatie (rwsverkeersinfo.nl)
//   API: https://api.rwsverkeersinfo.nl/api/cameras
//   Format: JSON — 26 traffic cameras on Dutch motorways (A1–A27)
//   Image: INMOVES streaming platform — static_url returns live JPEG frame
//   Update: Live snapshot (image refreshes periodically)
//   Coverage: Randstad region and major highways

const CACHE_TTL_MS = 5 * 60 * 1000;
const RWS_API_URL = 'https://api.rwsverkeersinfo.nl/api/cameras/';

interface RWSCamera {
  id: number;
  latitude: string;
  longitude: string;
  road: string;          // e.g. "A1", "A2", "A4", "A10", "A12"
  near: string;           // e.g. "Amersfoort", "knooppunt Diemen"
  location_description: string;
  description: string;
  attribution: string;
  stream_url: string;     // embed URL (iframe)
  static_url: string;     // direct JPEG snapshot — primary feed
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Dutch highway traffic cameras from Rijkswaterstaat Verkeersinformatie.
 * Uses the RWS public API which requires no authentication.
 * Camera images are served via INMOVES streaming platform (direct JPEG).
 */
export async function fetchNetherlandsCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(RWS_API_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) {
      console.error(`RWS API error: ${res.status}`);
      return [];
    }

    const data: RWSCamera[] = await res.json();

    const cameras: CctvCamera[] = data
      .filter(cam => {
        const lat = parseFloat(cam.latitude);
        const lng = parseFloat(cam.longitude);
        return !isNaN(lat) && !isNaN(lng) && cam.static_url;
      })
      .map(cam => ({
        id: `nl-rws-${cam.id}`,
        lat: parseFloat(cam.latitude),
        lng: parseFloat(cam.longitude),
        name: `${cam.road} ${cam.near}`,
        city: cam.near || 'Netherlands',
        country: 'Netherlands',
        feed_url: cam.static_url,
        source: 'Rijkswaterstaat',
      }));

    cached = cameras;
    cacheTs = Date.now();
    return cameras;
  } catch (err) {
    console.error('RWS fetch error:', err);
    if (cached) return cached;
    return [];
  }
}
