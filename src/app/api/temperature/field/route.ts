import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { clampStep } from '../route';
import { landMask } from './mask';
import { buildRGBADomain, LAT_BOT, LAT_TOP, type Domain } from './render';
import { getDomainPoints, resolveSource } from './sources';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Smooth temperature field (PNG), per domain + source.
 *
 * `?domain=ocean|land` selects the field; `?source=<id>` selects the data provider
 * (see ./sources.ts — e.g. open-meteo, noaa-oisst). The field is IDW-interpolated
 * from that source's points, blurred, and clipped to its side of the coastline via
 * the land mask, so sea/land are separate gradients with a clean coastline clip.
 * Cached to disk per domain+source+step.
 */

const INTERP_W = 360; // interpolation grid (1°)
const INTERP_H = 160;
const UPSCALE = 5; // → 1800×800 output
const BLUR = 7;
const TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * Full-resolution NOAA OISST render, straight from ERDDAP as a colored transparentPng
 * (native 0.25°, land transparent, BlueWhiteRed diverging palette). This is the same
 * technique Climate Reanalyzer / earth.nullschool use — a server-rendered raster at
 * native resolution — so it shows real eddies, currents and fronts, not a smoothed
 * blob. Clipped to ±LAT_TOP° to match the maplibre image quad.
 */
async function erddapOisstPng(): Promise<Buffer> {
  const q = `sst[(last)][(0.0)][(-${LAT_TOP - 0.125}):(${LAT_TOP - 0.125})][(-179.875):(179.875)]`;
  const url =
    `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.transparentPng?${encodeURIComponent(q)}` +
    `&.draw=surface&.vars=${encodeURIComponent('longitude|latitude|sst')}` +
    `&.colorBar=${encodeURIComponent('BlueWhiteRed|||-2|32|')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'OSIRIS/4.2' } });
  if (!res.ok) throw new Error(`ERDDAP transparentPng ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function cacheFile(domain: Domain, source: string, step: number): string {
  return path.join(CACHE_DIR, `temperature-field-${domain}-${source}-${step}.png`);
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

async function render(domain: Domain, source: string, step: number): Promise<Buffer> {
  // NOAA OISST ocean: use the native-resolution server-rendered ERDDAP raster
  // (real eddies/currents) instead of the coarse interpolation pipeline.
  if (source === 'noaa-oisst' && domain === 'ocean') return erddapOisstPng();

  const points = await getDomainPoints(domain, source, step);
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
  const source = resolveSource(domain, url.searchParams.get('source'));
  const file = cacheFile(domain, source, step);

  try {
    let png = await readFresh(file);
    if (!png) {
      png = await render(domain, source, step);
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
