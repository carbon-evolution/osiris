import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — NOAA NDBC buoy temperatures (live, in-situ, no key).
 *
 * Parses the National Data Buoy Center's single "latest observations" table
 * (all ~900 stations, hourly) into point markers carrying real measured sea
 * (WTMP) and air (ATMP) temperature. Complements the gridded SST fields with
 * ground-truth station data.
 *   https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt
 *
 * Columns (whitespace-delimited, "MM" = missing):
 *   STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES PTDY ATMP WTMP DEWP VIS TIDE
 *    0   1   2   3   4  5  6  7   8    9   10  11   12  13  14  15   16   17   18   19  20  21
 */

const SRC = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

type Buoy = {
  id: string;
  lat: number;
  lng: number;
  waterTemp: number | null;
  airTemp: number | null;
  temp: number; // waterTemp ?? airTemp — what the marker is colored by
  time: string;
};

function num(v: string): number | null {
  if (!v || v === 'MM') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const res = await fetch(SRC, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'OSIRIS/4.2' } });
    if (!res.ok) return NextResponse.json({ buoys: [], error: `NDBC ${res.status}` }, { status: 502 });
    const text = await res.text();

    const buoys: Buoy[] = [];
    for (const line of text.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const f = line.trim().split(/\s+/);
      if (f.length < 19) continue;
      const lat = Number(f[1]);
      const lng = Number(f[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const airTemp = num(f[17]);
      const waterTemp = num(f[18]);
      if (waterTemp === null && airTemp === null) continue;
      buoys.push({
        id: f[0],
        lat,
        lng,
        waterTemp,
        airTemp,
        temp: waterTemp ?? (airTemp as number),
        time: `${f[3]}-${f[4]}-${f[5]}T${f[6]}:${f[7]}:00Z`,
      });
    }

    return NextResponse.json(
      { buoys, total: buoys.length, source: 'NOAA NDBC', timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } },
    );
  } catch (error) {
    console.error('[OSIRIS] NDBC buoys error:', error);
    return NextResponse.json({ buoys: [], error: 'NDBC unavailable' }, { status: 500 });
  }
}
