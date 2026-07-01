import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { clampStep } from '../route';
import { landMask } from './mask';
import { buildRGBA, domainAlpha, LAT_BOT, LAT_TOP, type Domain } from './render';
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
const OUT_W = 1440; // output raster (0.25° — matches the coastline-clip mask)
const OUT_H = 640;
const BLUR = 6;
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
  // Grid clipped to ±(LAT_TOP-0.125)° so the 1440×640 image rows line up exactly with
  // the landMask(OUT_W, OUT_H) cell centers — lets us reuse the same cached mask.
  const q = `sst[(last)][(0.0)][(-${LAT_TOP - 0.125}):(${LAT_TOP - 0.125})][(-179.875):(179.875)]`;
  const url =
    `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.transparentPng?${encodeURIComponent(q)}` +
    `&.draw=surface&.vars=${encodeURIComponent('longitude|latitude|sst')}` +
    `&.colorBar=${encodeURIComponent('BlueWhiteRed|||-2|32|')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'OSIRIS/4.2' } });
  if (!res.ok) throw new Error(`ERDDAP transparentPng ${res.status}`);
  const png = Buffer.from(await res.arrayBuffer());

  // Re-clip ERDDAP's native 0.25° land cutout to OSIRIS's 50m coastline so the OISST
  // layer lines up with the Open-Meteo fields and the map basemap (Fix 2).
  const raw = await sharp(png).ensureAlpha().resize(OUT_W, OUT_H, { fit: 'fill' }).raw().toBuffer();
  const mask = await landMask(OUT_W, OUT_H, LAT_TOP, LAT_BOT);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) raw[i * 4 + 3] = 0; // land per 50m mask → transparent
  }
  return sharp(raw, { raw: { width: OUT_W, height: OUT_H, channels: 4 } }).png().toBuffer();
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

  // 1. Interpolate + color the WHOLE globe (no masking yet) so the blur mixes only
  //    valid colors — no black fringe bleeding in from off-domain pixels.
  const colorRgba = buildRGBA(points, INTERP_W, INTERP_H, 255);

  // 2. Upscale + blur for a smooth gradient, then drop the (now-feathered) alpha.
  const blurredRgb = await sharp(Buffer.from(colorRgba), { raw: { width: INTERP_W, height: INTERP_H, channels: 4 } })
    .resize(OUT_W, OUT_H, { kernel: sharp.kernel.cubic })
    .blur(BLUR)
    .removeAlpha()
    .raw()
    .toBuffer();

  // 3. Re-attach a HARD alpha clipped to the fine coastline at full output resolution,
  //    so the field ends exactly at the map's boundary (no coastal bleed).
  const hiMask = await landMask(OUT_W, OUT_H, LAT_TOP, LAT_BOT);
  const alpha = domainAlpha(hiMask, domain, 235);
  return sharp(blurredRgb, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
    .joinChannel(Buffer.from(alpha), { raw: { width: OUT_W, height: OUT_H, channels: 1 } })
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
