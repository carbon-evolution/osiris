import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { clampStep } from '../route';
import { renderFieldGeo } from '../field/route';
import { equirectToMercatorWorld } from '../field/mercator';
import { resolveSource } from '../field/sources';
import type { Domain } from '../field/render';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — temperature field as EPSG:3857 XYZ raster tiles.
 *
 * MapLibre's globe mis-registers `image` sources (the equirectangular field landed
 * ~17° too far north). Serving the field as Web-Mercator raster tiles — the same path
 * NASA GIBS uses — goes through MapLibre's correct projection and lines up with the
 * basemap. The field is rendered once to a full Web-Mercator world square (cached to
 * disk + memory), then each tile is an exact power-of-two crop of that square.
 *
 * URL: /api/temperature/fieldtile?domain=ocean&source=open-meteo&z={z}&x={x}&y={y}
 */

const MERC = 4096; // Web-Mercator world square (2^12 → exact crops through z=12)
const TILE = 256;
const TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const PNG = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' };

const memCache = new Map<string, { buf: Buffer; t: number }>();

function mercFile(domain: Domain, source: string, step: number): string {
  return path.join(CACHE_DIR, `temperature-merc-${domain}-${source}-${step}.png`);
}

/** Get the Web-Mercator world raster (RGBA, MERC×MERC) — memory cache → disk → render. */
async function mercatorWorld(domain: Domain, source: string, step: number): Promise<Buffer> {
  const key = `${domain}-${source}-${step}`;
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.buf;

  const file = mercFile(domain, source, step);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < TTL_MS) {
      const raw = await sharp(await fs.readFile(file)).ensureAlpha().raw().toBuffer();
      memCache.set(key, { buf: raw, t: stat.mtimeMs });
      return raw;
    }
  } catch {
    /* not cached */
  }

  // Render the equirectangular field, then reproject to a Web-Mercator world square.
  const geoPng = await renderFieldGeo(domain, source, step);
  const { data, info } = await sharp(geoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const merc = equirectToMercatorWorld(data, info.width, info.height, MERC);
  memCache.set(key, { buf: merc, t: Date.now() });
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, await sharp(merc, { raw: { width: MERC, height: MERC, channels: 4 } }).png().toBuffer());
  } catch {
    /* best-effort */
  }
  return merc;
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const step = clampStep(p.get('step'));
  const domain: Domain = p.get('domain') === 'land' ? 'land' : 'ocean';
  const source = resolveSource(domain, p.get('source'));
  const z = Number(p.get('z'));
  const x = Number(p.get('x'));
  const y = Number(p.get('y'));

  if (!Number.isInteger(z) || z < 0 || z > 12 || !Number.isInteger(x) || !Number.isInteger(y)) {
    return new Response('bad tile request', { status: 400 });
  }
  const n = 1 << z;
  if (x < 0 || x >= n || y < 0 || y >= n) return new Response('tile out of range', { status: 400 });

  try {
    const world = await mercatorWorld(domain, source, step);
    const size = MERC >> z; // exact: MERC is a power of two
    const tile = await sharp(world, { raw: { width: MERC, height: MERC, channels: 4 } })
      .extract({ left: x * size, top: y * size, width: size, height: size })
      .resize(TILE, TILE, { kernel: sharp.kernel.cubic })
      .png()
      .toBuffer();
    return new Response(new Uint8Array(tile), { headers: PNG });
  } catch (error) {
    console.error('[OSIRIS] temperature field tile error:', error);
    return new Response('tile unavailable', { status: 500 });
  }
}
