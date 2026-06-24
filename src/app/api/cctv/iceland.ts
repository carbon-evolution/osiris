import type { CctvCamera } from './types';

// ── Iceland Road Cameras (no API key required) ──
// Source: Vegagerðin / Icelandic Road & Coastal Administration — umferdin.is.
// The cameras page is server-rendered (Next.js); its __NEXT_DATA__ payload
// embeds the full camera list with coordinates and direct JPEG image URLs on
// www.vegagerdin.is/vgdata/vefmyndavelar/ (https, loads directly, no proxy).
// ~160 cameras nationwide. stream_type 'jpg'.

const PAGE_URL = 'https://umferdin.is/en/cameras';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Iceland (Vegagerðin) road cameras from umferdin.is.
 * No API key required — ~160 cameras, JPG snapshots. Parses the SSR
 * __NEXT_DATA__ payload (stable Next.js convention).
 */
export async function fetchIcelandCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(PAGE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });
    if (!res.ok) return cached ?? [];
    const html = await res.text();

    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return cached ?? [];
    const data: any = JSON.parse(m[1]);
    const list: any[] = data?.props?.pageProps?.cameras ?? [];

    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of list) {
      const lat: number = c?.coordinates?.lat;
      const lng: number = c?.coordinates?.lon;
      const image: string = c?.images?.[0]?.url || '';
      const id: string = String(c?.id ?? '');
      if (!lat || !lng || !image || !id) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      cameras.push({
        id: `is-${id}`,
        lat,
        lng,
        name: c.name || 'Vegagerðin camera',
        city: c.roadName || '',
        country: 'Iceland',
        feed_url: image,
        stream_url: image,
        stream_type: 'jpg',
        source: 'Vegagerðin Iceland',
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
