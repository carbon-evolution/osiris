import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildGrid, chunk, classifyPoints, gibsTileUrl, utcDateString, type ClassifiedPoint, type LandFC } from './grid';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Global Temperature field.
 *
 * Combines ocean sea-surface temperature + land 2 m air temperature from
 * Open-Meteo (free, no API key) into a single cached GeoJSON grid, plus NASA
 * GIBS colorized raster tile templates for the broad backdrop. The grid is
 * cached to a local file first, then served — see CACHE_FILE.
 */

const GRID_STEP_DEFAULT = 5; // degrees — see design spec (free-tier budget)
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const BATCH = 100; // coords per Open-Meteo request
const CONCURRENCY = 6; // parallel Open-Meteo requests
const FETCH_TIMEOUT = 15000;

const GIBS_SST = 'GHRSST_L4_MUR_Sea_Surface_Temperature'; // used only to probe latest available date

const CACHE_DIR = path.join(process.cwd(), '.cache');
const LAND_FILE = path.join(process.cwd(), 'public', 'data', 'land-110m.json');

type TempFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { temp: number; kind: 'ocean' | 'land' };
};

type TempPayload = {
  type: 'FeatureCollection';
  features: TempFeature[];
  meta: {
    step: number;
    count: number;
    tempMin: number | null;
    tempMax: number | null;
    generatedAt: string;
    cached: boolean;
    gibs: { date: string; sstUrl: string; lstUrl: string };
  };
};

let landFcPromise: Promise<LandFC> | null = null;
function loadLand(): Promise<LandFC> {
  if (!landFcPromise) {
    landFcPromise = fs.readFile(LAND_FILE, 'utf8').then((t) => JSON.parse(t) as LandFC);
  }
  return landFcPromise;
}

function cacheFile(step: number): string {
  return path.join(CACHE_DIR, `temperature-grid-${step}.json`);
}

async function readCache(step: number): Promise<TempPayload | null> {
  try {
    const raw = await fs.readFile(cacheFile(step), 'utf8');
    const payload = JSON.parse(raw) as TempPayload;
    const age = Date.now() - new Date(payload.meta.generatedAt).getTime();
    if (age < TTL_MS) return { ...payload, meta: { ...payload.meta, cached: true } };
    return null;
  } catch {
    return null;
  }
}

async function writeCache(step: number, payload: TempPayload): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile(step), JSON.stringify(payload), 'utf8');
  } catch {
    /* best-effort: still serve the freshly-fetched payload */
  }
}

/** Probe GIBS for the most recent date with a published SST tile (yesterday → back a few days). */
async function resolveGibsDate(): Promise<string> {
  for (let daysAgo = 1; daysAgo <= 4; daysAgo++) {
    const date = utcDateString(daysAgo);
    const probe = gibsTileUrl(GIBS_SST, date).replace('{z}/{y}/{x}', '2/1/1');
    try {
      const res = await fetch(probe, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
      if (res.ok) return date;
    } catch {
      /* try an earlier date */
    }
  }
  return utcDateString(2); // sensible fallback
}

type OmResult = { current?: Record<string, number | null> };

/** Fetch one batch of coordinates from an Open-Meteo endpoint; returns temp per input index (null if missing). */
async function fetchBatch(baseUrl: string, field: string, pts: ClassifiedPoint[]): Promise<(number | null)[]> {
  const lat = pts.map((p) => p.lat).join(',');
  const lng = pts.map((p) => p.lng).join(',');
  const url = `${baseUrl}?latitude=${lat}&longitude=${lng}&current=${field}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as OmResult | OmResult[];
  const arr = Array.isArray(json) ? json : [json];
  return pts.map((_, i) => {
    const v = arr[i]?.current?.[field];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

/** Run async tasks with bounded concurrency. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchTemps(points: ClassifiedPoint[], baseUrl: string, field: string): Promise<TempFeature[]> {
  const batches = chunk(points, BATCH);
  const batchResults = await pool(batches, CONCURRENCY, async (batch) => {
    try {
      const temps = await fetchBatch(baseUrl, field, batch);
      return batch.map((p, i) => ({ p, temp: temps[i] }));
    } catch {
      return batch.map((p) => ({ p, temp: null as number | null }));
    }
  });

  const features: TempFeature[] = [];
  for (const batch of batchResults) {
    for (const { p, temp } of batch) {
      if (temp === null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { temp, kind: p.kind },
      });
    }
  }
  return features;
}

async function build(step: number): Promise<TempPayload> {
  const land = await loadLand();
  const classified = classifyPoints(buildGrid(step), land);
  const landPts = classified.filter((p) => p.kind === 'land');
  const oceanPts = classified.filter((p) => p.kind === 'ocean');

  const [landFeatures, oceanFeatures, gibsDate] = await Promise.all([
    fetchTemps(landPts, 'https://api.open-meteo.com/v1/forecast', 'temperature_2m'),
    fetchTemps(oceanPts, 'https://marine-api.open-meteo.com/v1/marine', 'sea_surface_temperature'),
    resolveGibsDate(),
  ]);

  const features = [...landFeatures, ...oceanFeatures];
  const temps = features.map((f) => f.properties.temp);

  return {
    type: 'FeatureCollection',
    features,
    meta: {
      step,
      count: features.length,
      tempMin: temps.length ? Math.min(...temps) : null,
      tempMax: temps.length ? Math.max(...temps) : null,
      generatedAt: new Date().toISOString(),
      cached: false,
      // Tiles served through the local proxy/cache (see ./tile/route.ts), not GIBS directly.
      gibs: {
        date: gibsDate,
        sstUrl: `/api/temperature/tile?layer=sst&date=${gibsDate}&z={z}&x={x}&y={y}`,
        lstUrl: `/api/temperature/tile?layer=lst&date=${gibsDate}&z={z}&x={x}&y={y}`,
      },
    },
  };
}

export async function GET(req: Request) {
  const stepParam = Number(new URL(req.url).searchParams.get('step'));
  const step = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 20 ? stepParam : GRID_STEP_DEFAULT;

  try {
    const cached = await readCache(step);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
      });
    }

    const payload = await build(step);

    // If Open-Meteo produced nothing, fall back to any prior cache (even if stale).
    if (payload.features.length === 0) {
      try {
        const stale = JSON.parse(await fs.readFile(cacheFile(step), 'utf8')) as TempPayload;
        return NextResponse.json({ ...stale, meta: { ...stale.meta, cached: true } });
      } catch {
        /* no prior cache — return the (empty) payload so rasters still render */
      }
    } else {
      await writeCache(step, payload);
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('[OSIRIS] temperature route error:', error);
    return NextResponse.json(
      { type: 'FeatureCollection', features: [], error: 'Temperature data unavailable' },
      { status: 500 },
    );
  }
}
