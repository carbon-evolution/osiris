import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { clampStep, getTemperaturePayload } from '../route';
import { landMask } from './mask';
import { buildRGBADomain, LAT_BOT, LAT_TOP, type Domain, type FieldPoint } from './render';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Smooth temperature field (PNG), per domain.
 *
 * `?domain=ocean` (sea-surface temp) or `?domain=land` (2 m air temp) renders that
 * field only: IDW-interpolated from its own points, blurred, and clipped to its side
 * of the coastline via the land mask. Two separate toggles draw the two gradients so
 * the sea↔land transition is a clean coastline clip, not an ugly cross-blend.
 * Replaces the grainy GIBS raster + dotted heatmap. Cached to disk per domain+step.
 */

const INTERP_W = 360; // interpolation grid (1°)
const INTERP_H = 160;
const UPSCALE = 5; // → 1800×800 output
const BLUR = 7;
const TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), '.cache');

function cacheFile(domain: Domain, step: number): string {
  return path.join(CACHE_DIR, `temperature-field-${domain}-${step}.png`);
}

function parseDomain(raw: string | null): Domain {
  return raw === 'land' ? 'land' : 'ocean';
}

async function readFresh(file: string): Promise<Buffer | null> {
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < TTL_MS) return await fs.readFile(file);
  } catch {
    /* not cached */
  }
  return null;
}

async function render(domain: Domain, step: number): Promise<Buffer> {
  const payload = await getTemperaturePayload(step);
  const wantKind = domain === 'land' ? 'land' : 'ocean';
  const points: FieldPoint[] = payload.features
    .filter((f) => f.properties.kind === wantKind)
    .map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], temp: f.properties.temp }));

  const mask = await landMask(INTERP_W, INTERP_H, LAT_TOP, LAT_BOT);
  const rgba = buildRGBADomain(points, INTERP_W, INTERP_H, mask, domain);
  return sharp(Buffer.from(rgba), { raw: { width: INTERP_W, height: INTERP_H, channels: 4 } })
    .resize(INTERP_W * UPSCALE, INTERP_H * UPSCALE, { kernel: sharp.kernel.cubic })
    .blur(BLUR)
    .png()
    .toBuffer();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const step = clampStep(url.searchParams.get('step'));
  const domain = parseDomain(url.searchParams.get('domain'));
  const file = cacheFile(domain, step);

  try {
    let png = await readFresh(file);
    if (!png) {
      png = await render(domain, step);
      try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(file, png);
      } catch {
        /* best-effort cache */
      }
    }
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('[OSIRIS] temperature field render error:', error);
    return new Response('field unavailable', { status: 500 });
  }
}
