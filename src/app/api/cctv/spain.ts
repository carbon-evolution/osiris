import type { CctvCamera } from './types';

// ── Spain Highway Cameras (no API key required) ──
// Source: DGT (Dirección General de Tráfico) — Spanish Traffic Authority
//   ~300-400 cameras  —  https://www.dgt.es/.content/.assets/json/camaras.json
// Returns JSON with camera array: id, latitud, longitud, imagen, carretera, pk, provincia, sentido, fecha.
// Images are static JPG snapshots from https://etraffic.dgt.es/camarasEtraffic/
// Public data under Creative Commons Attribution license.

const CACHE_TTL_MS = 5 * 60 * 1000;
const DGT_URL = 'https://www.dgt.es/.content/.assets/json/camaras.json';

interface DgtCamera {
  id: string;
  latitud: string;
  longitud: string;
  imagen: string;
  carretera: string;
  pk: string;
  provincia: string;
  sentido: string;
  fecha: string;
}

interface DgtResponse {
  camaras: DgtCamera[];
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Spain highway traffic cameras from DGT (Dirección General de Tráfico).
 * Source: ~300-400 cameras covering Spanish highways.
 * No API key required — public JSON endpoint.
 */
export async function fetchSpainCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(DGT_URL, {
      signal: AbortSignal.timeout(12000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];

    const data: DgtResponse = await res.json();
    const cameras: CctvCamera[] = [];
    const seen = new Set<string>();

    for (const c of data.camaras ?? []) {
      const id = `es-${c.id}`;
      const lat = parseFloat(c.latitud);
      const lng = parseFloat(c.longitud);
      const feedUrl: string = c.imagen || '';

      if (!c.id || !lat || !lng || !feedUrl) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const road: string = c.carretera || '';
      const pk: string = c.pk || '';
      const name = road && pk ? `${road} — ${pk}` : road || `Camera ${c.id}`;

      cameras.push({
        id,
        lat,
        lng,
        name,
        city: c.provincia || '',
        country: 'Spain',
        feed_url: feedUrl,
        stream_type: 'jpg',
        source: 'DGT Spain',
      });
    }

    cached = cameras;
    cacheTs = Date.now();
    return cameras;
  } catch {
    return [];
  }
}
