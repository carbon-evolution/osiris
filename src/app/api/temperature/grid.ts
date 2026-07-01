import { booleanPointInPolygon, point as turfPoint } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * OSIRIS — Temperature layer: pure grid + classification helpers.
 *
 * Kept free of I/O so they can be unit-tested without network or filesystem.
 */

export type LandFC = FeatureCollection<Polygon | MultiPolygon>;

export interface GridPoint {
  lat: number;
  lng: number;
}

export type Kind = 'ocean' | 'land';

export interface ClassifiedPoint extends GridPoint {
  kind: Kind;
}

/** Latitude bound — poles excluded (no meaningful SST, sparse land data). */
export const LAT_LIMIT = 80;

/**
 * Build a global lat/lng grid at `step` degrees.
 * lat spans [-LAT_LIMIT, +LAT_LIMIT]; lng spans [-180, 180).
 */
export function buildGrid(step: number): GridPoint[] {
  if (!(step > 0)) throw new Error(`grid step must be > 0, got ${step}`);
  const points: GridPoint[] = [];
  for (let lat = -LAT_LIMIT; lat <= LAT_LIMIT + 1e-9; lat += step) {
    for (let lng = -180; lng < 180 - 1e-9; lng += step) {
      points.push({ lat: round(lat), lng: round(lng) });
    }
  }
  return points;
}

/** Classify each point as land or ocean using a land-polygon FeatureCollection. */
export function classifyPoints(points: GridPoint[], land: LandFC): ClassifiedPoint[] {
  const features = land.features;
  return points.map((p) => {
    const pt = turfPoint([p.lng, p.lat]);
    const onLand = features.some((f) => safeInPolygon(pt, f));
    return { ...p, kind: onLand ? 'land' : 'ocean' };
  });
}

function safeInPolygon(pt: ReturnType<typeof turfPoint>, f: Feature<Polygon | MultiPolygon>): boolean {
  try {
    return booleanPointInPolygon(pt, f);
  } catch {
    return false;
  }
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** GIBS REST/XYZ tile URL template for a colorized layer at a given date. */
export function gibsTileUrl(layer: string, date: string, matrixSet = 'GoogleMapsCompatible_Level7'): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/${matrixSet}/{z}/{y}/{x}.png`;
}

/** YYYY-MM-DD for `daysAgo` days before now, in UTC. */
export function utcDateString(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  return d.toISOString().slice(0, 10);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
