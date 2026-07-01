import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * OSIRIS — land/ocean raster mask.
 *
 * Rasterizes the local land-110m polygons into a W×H bitmask (1 = land, 0 = ocean)
 * so the temperature fields can be clipped exactly at the coastline — sea and land
 * are rendered as separate gradients with no cross-coast blending. Pure ray-casting
 * (no turf) with per-polygon bbox pre-filtering; memoized per resolution.
 */

type Ring = number[][];
type Poly = { rings: Ring[]; minX: number; minY: number; maxX: number; maxY: number };

// 50m Natural Earth coastline — fine enough to resolve the Mediterranean, Red Sea,
// Persian Gulf, Black/Caspian etc. so the field clips to the map's real boundaries.
const LAND_FILE = path.join(process.cwd(), 'public', 'data', 'land-50m.json');

let polysPromise: Promise<Poly[]> | null = null;
const maskCache = new Map<string, Uint8Array>();

async function loadPolys(): Promise<Poly[]> {
  if (!polysPromise) {
    polysPromise = (async () => {
      const fc = JSON.parse(await fs.readFile(LAND_FILE, 'utf8'));
      const polys: Poly[] = [];
      for (const f of fc.features ?? []) {
        const g = f.geometry;
        const groups = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
        for (const rings of groups) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [x, y] of rings[0]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          polys.push({ rings, minX, minY, maxX, maxY });
        }
      }
      return polys;
    })();
  }
  return polysPromise;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isLand(lng: number, lat: number, polys: Poly[]): boolean {
  for (const p of polys) {
    if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue;
    if (!inRing(lng, lat, p.rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < p.rings.length; h++) {
      if (inRing(lng, lat, p.rings[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * Build (or reuse) a W×H land bitmask spanning lng [-180,180), lat [latTop,latBot].
 * Pass `rowLat` to place rows at explicit latitudes (e.g. mercator-spaced).
 */
export async function landMask(w: number, h: number, latTop: number, latBot: number, rowLat?: Float64Array): Promise<Uint8Array> {
  const key = `${w}x${h}@${latTop},${latBot}${rowLat ? ':merc' : ''}`;
  const cached = maskCache.get(key);
  if (cached) return cached;

  const polys = await loadPolys();
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = rowLat ? rowLat[y] : latTop - ((y + 0.5) / h) * (latTop - latBot);
    for (let x = 0; x < w; x++) {
      const lng = -180 + ((x + 0.5) / w) * 360;
      mask[y * w + x] = isLand(lng, lat, polys) ? 1 : 0;
    }
  }
  maskCache.set(key, mask);
  return mask;
}
