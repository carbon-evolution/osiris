import type { CctvCamera } from './types';

// ── New Zealand: Waka Kotahi NZTA Traffic Cameras (no API key required) ──
// Source: NZ Transport Agency — trafficnz.info (open data, no auth)
//   XML:  https://trafficnz.info/service/traffic/rest/4/cameras/all  (~320 cameras)
//   Image: https://trafficnz.info/camera/{id}.jpg  (full snapshot)
//   Thumb: https://trafficnz.info/camera/thumb/{id}.jpg
//   View:  https://trafficnz.info/camera/view/{id}
// Coverage: All NZ regions (Canterbury, Auckland, Wellington, Otago, Waikato, etc.)
// Note: The API returns XML, not JSON — parse with regex since it's simple and predictable

const CACHE_TTL_MS = 5 * 60 * 1000;
const API_URL = 'https://trafficnz.info/service/traffic/rest/4/cameras/all';

/** Extract a single text value from an XML tag, or return fallback */
function xmlTag(xml: string, tag: string, fallback = ''): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
  return m ? m[1].trim() : fallback;
}

/** Parse the NZTA XML into a flat array */
function parseNztXml(xml: string): Record<string, string>[] {
  const cameras: Record<string, string>[] = [];
  // Split on <camera> ... </camera> blocks
  const blockRe = /<camera>([\s\S]*?)<\/camera>/g;
  let match: RegExpExecArray | null = blockRe.exec(xml);
  while (match !== null) {
    const block = match[1];
    const cam: Record<string, string> = {};
    // Extract all simple child tags
    const tagRe = /<(\w+)>([^<]*)<\/\1>/g;
    let tm: RegExpExecArray | null = tagRe.exec(block);
    while (tm !== null) {
      cam[tm[1]] = tm[2].trim();
      tm = tagRe.exec(block);
    }
    if (cam.id) cameras.push(cam);
    match = blockRe.exec(xml);
  }
  return cameras;
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

export async function fetchNewZealandCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(API_URL, {
      signal: AbortSignal.timeout(20000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const rawCameras = parseNztXml(xml);

    const cameras: CctvCamera[] = [];

    for (const cam of rawCameras) {
      if (cam.offline === 'true' || cam.underMaintenance === 'true') continue;
      const lat = parseFloat(cam.latitude);
      const lng = parseFloat(cam.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      if (!cam.imageUrl) continue;

      const displayName = cam.name || cam.description || `NZTA Camera ${cam.id}`;

      cameras.push({
        id: `nz-nzta-${cam.id}`,
        lat,
        lng,
        name: displayName,
        city: cam.region || '',
        country: 'New Zealand',
        feed_url: `https://trafficnz.info${cam.imageUrl}`,
        stream_type: 'jpg',
        source: 'NZTA',
      });
    }

    cached = cameras;
    cacheTs = Date.now();
    return cameras;
  } catch {
    if (cached) return cached;
    return [];
  }
}
