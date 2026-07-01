import { NextResponse } from 'next/server';
import { pointTemperature } from '../field/sources';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Point temperature lookup for a single coordinate.
 * MET Norway (government, no key) primary; Open-Meteo fallback. See field/sources.ts.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get('lat'));
  const lon = Number(p.get('lon') ?? p.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }
  const t = await pointTemperature(lat, lon);
  if (!t) return NextResponse.json({ error: 'temperature unavailable' }, { status: 502 });
  return NextResponse.json(t, { headers: { 'Cache-Control': 'public, s-maxage=600' } });
}
