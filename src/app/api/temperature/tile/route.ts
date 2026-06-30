import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Temperature GIBS tile proxy + local disk cache.
 *
 * Projects NASA GIBS colorized raster tiles (ocean SST + land LST) through a
 * local cache so the layer is "cached locally, then projected":
 *   - cached on disk        → served from .cache/tiles (no upstream hit)
 *   - upstream tile exists   → fetched, cached, served
 *   - upstream 404 (no-data) → transparent 1×1 PNG, cached, served as 200
 * Returning transparent PNGs for GIBS no-data tiles (SST over land, LST over
 * ocean) keeps the browser console free of the 404 storm those tiles produce.
 */

const GIBS_LAYERS: Record<string, string> = {
  sst: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
  lst: 'MODIS_Terra_Land_Surface_Temp_Day',
};

const MATRIX = 'GoogleMapsCompatible_Level7';
const TILE_DIR = path.join(process.cwd(), '.cache', 'tiles');

// 1×1 fully transparent PNG.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const PNG = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' };

function safe(seg: string): string {
  return /^[A-Za-z0-9_-]+$/.test(seg) ? seg : '';
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const layer = p.get('layer') || '';
  const date = safe(p.get('date') || '');
  const z = safe(p.get('z') || '');
  const x = safe(p.get('x') || '');
  const y = safe(p.get('y') || '');
  const gibsLayer = GIBS_LAYERS[layer];

  if (!gibsLayer || !date || z === '' || x === '' || y === '') {
    return new Response('bad tile request', { status: 400 });
  }

  const file = path.join(TILE_DIR, layer, date, z, x, `${y}.png`);

  // 1. disk cache
  try {
    const buf = await fs.readFile(file);
    return new Response(new Uint8Array(buf), { headers: PNG });
  } catch {
    /* not cached yet */
  }

  // 2. upstream fetch (GIBS path order is /{z}/{y}/{x})
  const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${gibsLayer}/default/${date}/${MATRIX}/${z}/${y}/${x}.png`;
  let body: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      body = Buffer.from(await res.arrayBuffer());
    } else {
      body = BLANK_PNG; // no-data / beyond-resolution → transparent
    }
  } catch {
    // Upstream unreachable — serve transparent but DON'T cache (so we retry later).
    return new Response(new Uint8Array(BLANK_PNG), { headers: PNG });
  }

  // 3. cache to disk (best-effort)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  } catch {
    /* best-effort */
  }

  return new Response(new Uint8Array(body), { headers: PNG });
}
