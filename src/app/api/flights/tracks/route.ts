import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Aircraft Track History API
 *
 * Fetches the flight trajectory for a specific aircraft from the OpenSky tracks
 * API (free, no authentication required). Returns a GeoJSON LineString that can
 * be rendered directly on the map.
 *
 * OpenSky: /api/tracks/all?icao24=<ICAO24>&time=<unix_timestamp>
 *   Returns: [timestamp, lat, lon, altitude, velocity, heading, verticalRate]
 *
 * Caches per icao24 for 2 minutes — tracks update infrequently for most flights.
 */

const cache = new Map<string, { ts: number; data: any }>();
const CACHE_TTL_MS = 2 * 60 * 1000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { ts: Date.now(), data });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

interface TrackPoint {
  ts: number;
  lat: number;
  lon: number;
  alt: number;
  velocity: number;
  heading: number;
  vertRate: number;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao24 = (searchParams.get('icao24') || '').toLowerCase().trim();
  const timeParam = searchParams.get('time');

  if (!icao24 || icao24.length < 6) {
    return NextResponse.json(
      { error: 'Requires icao24 parameter (hex transponder ID, min 6 chars)' },
      { status: 400 },
    );
  }

  const cacheKey = `${icao24}:${timeParam || 'latest'}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }

  // Build OpenSky tracks API URL
  // If no time provided, default to 4 hours ago to get a reasonable track window
  const time = timeParam
    ? parseInt(timeParam, 10)
    : Math.floor(Date.now() / 1000) - 4 * 3600;

  const url = `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=${time}`;

  try {
    const res = await stealthFetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenSky API returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // OpenSky tracks API returns:
    // { icao24, startTime, endTime, callsign, path: [[ts, lat, lon, alt, velocity, heading, vertRate], ...] }
    if (!data || !data.path || !Array.isArray(data.path) || data.path.length === 0) {
      return NextResponse.json(
        { error: 'No track data available for this aircraft' },
        { status: 404 },
      );
    }

    const rawPath: number[][] = data.path;

    // Build structured track points and GeoJSON LineString
    const points: TrackPoint[] = rawPath.map((p: number[]) => ({
      ts: p[0],
      lat: p[1],
      lon: p[2],
      alt: p[3] || 0,
      velocity: p[4] || 0,
      heading: p[5] || 0,
      vertRate: p[6] || 0,
    }));

    // Filter out obviously bad points (lat/lon out of range)
    const validPoints = points.filter(p =>
      p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180
    );

    if (validPoints.length < 2) {
      return NextResponse.json(
        { error: 'Track data contains insufficient valid coordinates' },
        { status: 404 },
      );
    }

    // Sample track to ~200 points max for map performance
    const sampledPoints = sampleTrack(points, 200);
    const sampledCoords: [number, number][] = sampledPoints.map(p => [p.lon, p.lat]);

    // Compute stats
    const altitudes = validPoints.map(p => p.alt);
    const speeds = validPoints.filter(p => p.velocity > 0).map(p => p.velocity);
    const maxAlt = Math.max(...altitudes);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    const startTime = data.startTime || validPoints[0].ts;
    const endTime = data.endTime || validPoints[validPoints.length - 1].ts;
    const durationSec = endTime - startTime;

    const result = {
      icao24,
      callsign: data.callsign || '',
      startTime,
      endTime,
      duration_sec: durationSec,
      stats: {
        points_total: validPoints.length,
        points_sampled: sampledPoints.length,
        max_alt_m: Math.round(maxAlt),
        max_speed_ms: Math.round(maxSpeed * 10) / 10,
        max_speed_knots: Math.round(maxSpeed * 1.94384),
      },
      geojson: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: sampledCoords,
        },
        properties: {
          icao24,
          callsign: data.callsign || '',
          startTime,
          endTime,
          max_alt_m: Math.round(maxAlt),
          max_speed_knots: Math.round(maxSpeed * 1.94384),
        },
      },
      // Full-resolution track data for the popup
      track: sampledPoints.map(p => ({
        ts: p.ts,
        lat: Math.round(p.lat * 100000) / 100000,
        lon: Math.round(p.lon * 100000) / 100000,
        alt_m: Math.round(p.alt),
        speed_ms: Math.round(p.velocity * 10) / 10,
        heading: Math.round(p.heading),
        vert_rate: Math.round(p.vertRate),
      })),
    };

    setCache(cacheKey, result);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    console.error('[TRACKS] OpenSky API error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Failed to fetch track data' },
      { status: 502 },
    );
  }
}

/**
 * Sample an array of track points to a target maximum, preserving first + last.
 */
function sampleTrack<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const result: T[] = [points[0]];
  const step = (points.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}
