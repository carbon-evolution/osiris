
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Active Fire & Wildfire Tracking
 * Combines all four keyless NASA FIRMS open-data satellites for the last 24h —
 * VIIRS S-NPP, VIIRS NOAA-20 (J1), VIIRS NOAA-21 (J2) and MODIS C6.1 — plus
 * NASA EONET volcanoes. Hotspots from the different satellites are merged onto
 * a coarse grid so the same fire seen by multiple passes collapses to one
 * point (keeping the strongest reading). No API key required.
 */

type Fire = {
  lat: number;
  lng: number;
  brightness: number;
  confidence: string;
  date: string;
  time: string;
  frp: number;
  daynight?: string;
  satellite?: string;
  type: string;
};

const FIRMS_SOURCES: { url: string; label: string }[] = [
  { url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv', label: 'VIIRS S-NPP' },
  { url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv', label: 'VIIRS NOAA-20' },
  { url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv', label: 'VIIRS NOAA-21' },
  { url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv', label: 'MODIS' },
];

const MAX_PER_SOURCE = 6000; // bound work per satellite before merging
const MAX_OUTPUT = 3000; // global cap sent to the client

async function fetchFirms(url: string, label: string): Promise<Fire[]> {
  const res = await fetch(url, {
    // The global 24h VIIRS CSVs are ~7 MB each; downloaded in parallel they
    // need more headroom than the small MODIS file.
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'OSIRIS-Intelligence-Platform/3.5' },
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text || !text.includes('latitude') || text.length < 200) return [];
  return parseCSV(text, label);
}

export async function GET() {
  try {
    const results = await Promise.allSettled(FIRMS_SOURCES.map((s) => fetchFirms(s.url, s.label)));

    // Merge all satellites onto a ~1km grid; keep the strongest (FRP) reading
    // per cell so overlapping passes collapse into a single hotspot.
    const grid = new Map<string, Fire>();
    const used = new Set<string>();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const f of r.value) {
        const key = `${f.lat.toFixed(2)},${f.lng.toFixed(2)}`;
        const existing = grid.get(key);
        if (!existing || f.frp > existing.frp) grid.set(key, f);
      }
    }
    for (const r of results) if (r.status === 'fulfilled' && r.value.length) used.add(r.value[0].satellite || '');

    let fires: Fire[] = Array.from(grid.values());
    // Global cap to keep the map responsive. Sample evenly across the merged
    // set so coverage stays geographically representative and isn't biased to
    // one satellite's high-FRP readings.
    if (fires.length > MAX_OUTPUT) {
      const step = Math.ceil(fires.length / MAX_OUTPUT);
      fires = fires.filter((_, i) => i % step === 0);
    }

    // NASA EONET volcanoes for richer hazard context.
    try {
      const volcRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes&limit=50', {
        signal: AbortSignal.timeout(10000),
      });
      if (volcRes.ok) {
        const volcData = await volcRes.json();
        const volcanoes: Fire[] = (volcData.events || []).map((e: any) => {
          const geo = e.geometry?.[e.geometry.length - 1];
          if (!geo?.coordinates) return null;
          return {
            lat: geo.coordinates[1], lng: geo.coordinates[0],
            brightness: 500, confidence: 'high',
            date: geo.date?.split('T')[0] || '', time: '', frp: 100,
            satellite: 'EONET', title: `[VOLCANO] ${e.title}`, type: 'volcano',
          } as any;
        }).filter(Boolean);
        fires = [...fires, ...volcanoes];
      }
    } catch (e) {
      console.warn('[OSIRIS] Suppressed EONET error:', e instanceof Error ? e.message : e);
    }

    const sources = [...Array.from(used).filter(Boolean)];
    return NextResponse.json(
      {
        fires,
        total: fires.length,
        sources: sources.length ? sources.join(' + ') : 'Unknown',
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } },
    );
  } catch (error) {
    console.error('Fire fetch error:', error);
    return NextResponse.json({ fires: [], error: 'Failed to fetch fire data' }, { status: 500 });
  }
}

function parseCSV(csv: string, label: string): Fire[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const latIdx = header.indexOf('latitude');
  const lngIdx = header.indexOf('longitude');
  const brightIdx = header.indexOf('bright_ti4') !== -1 ? header.indexOf('bright_ti4') : header.indexOf('brightness');
  const confIdx = header.indexOf('confidence');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const frpIdx = header.indexOf('frp');
  const dnIdx = header.indexOf('daynight');

  const fires: Fire[] = [];
  const step = lines.length - 1 > MAX_PER_SOURCE ? Math.ceil((lines.length - 1) / MAX_PER_SOURCE) : 1;

  for (let i = 1; i < lines.length; i += step) {
    const cols = lines[i].split(',');
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (isNaN(lat) || isNaN(lng)) continue;

    fires.push({
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000,
      brightness: parseFloat(cols[brightIdx]) || 0,
      confidence: cols[confIdx] || 'unknown',
      date: cols[dateIdx] || '',
      time: cols[timeIdx] || '',
      frp: parseFloat(cols[frpIdx]) || 0,
      daynight: dnIdx !== -1 ? (cols[dnIdx] === 'D' ? 'day' : cols[dnIdx] === 'N' ? 'night' : '') : '',
      satellite: label,
      type: 'fire',
    });
  }

  return fires;
}
