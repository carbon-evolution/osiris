
import { NextResponse } from 'next/server';

/**
 * OSIRIS — Earthquake Data API
 * Real-time seismic events from two keyless feeds, merged + deduplicated:
 *   - USGS (M2.5+, last 24h) — strongest for the Americas
 *   - EMSC / seismicportal.eu (FDSN, M2.5+, last 24h) — strongest for EU/Asia
 * No API key required.
 */

export const dynamic = 'force-dynamic';

type Quake = {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  magnitude: number;
  place: string;
  time: number; // epoch ms
  url: string;
  tsunami?: number;
  type?: string;
  felt?: number | null;
  alert?: string | null;
  source: 'USGS' | 'EMSC';
};

async function fetchUSGS(): Promise<Quake[]> {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('USGS unavailable');
  const data = await res.json();
  return (data.features || []).map((f: any): Quake => {
    const c = f.geometry?.coordinates || [0, 0, 0];
    const p = f.properties || {};
    return {
      id: f.id, lat: c[1], lng: c[0], depth: c[2],
      magnitude: p.mag, place: p.place, time: p.time, url: p.url,
      tsunami: p.tsunami, type: p.type, felt: p.felt, alert: p.alert,
      source: 'USGS',
    };
  });
}

async function fetchEMSC(): Promise<Quake[]> {
  const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19);
  const url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&start=${start}&minmag=2.5&limit=500`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'OSIRIS-Intelligence-Platform/3.5' } });
  if (!res.ok) throw new Error('EMSC unavailable');
  const data = await res.json();
  return (data.features || []).map((f: any): Quake => {
    const p = f.properties || {};
    const c = f.geometry?.coordinates || [p.lon, p.lat, p.depth];
    return {
      id: `emsc-${p.unid || f.id}`,
      lat: p.lat ?? c[1], lng: p.lon ?? c[0], depth: p.depth ?? c[2],
      magnitude: p.mag,
      place: p.flynn_region || 'Unknown region',
      time: p.time ? new Date(p.time).getTime() : Date.now(),
      url: p.unid ? `https://www.seismicportal.eu/eventdetails.html?unid=${p.unid}` : '',
      type: p.evtype === 'ke' ? 'earthquake' : (p.evtype || 'earthquake'),
      source: 'EMSC',
    };
  });
}

export async function GET() {
  try {
    const [usgsR, emscR] = await Promise.allSettled([fetchUSGS(), fetchEMSC()]);
    const usgs = usgsR.status === 'fulfilled' ? usgsR.value : [];
    const emsc = emscR.status === 'fulfilled' ? emscR.value : [];

    // USGS first (authoritative), then EMSC events that aren't near-duplicates.
    const merged: Quake[] = [...usgs];
    for (const q of emsc) {
      const dupe = merged.some(
        (m) => Math.abs(m.lat - q.lat) < 0.5 && Math.abs(m.lng - q.lng) < 0.5 && Math.abs(m.time - q.time) < 60_000,
      );
      if (!dupe) merged.push(q);
    }

    const sources = [usgs.length ? 'USGS' : null, emsc.length ? 'EMSC' : null]
      .filter(Boolean).join(' + ') || 'none';

    return NextResponse.json(
      { earthquakes: merged, total: merged.length, sources, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (error) {
    console.error('Earthquake fetch error:', error);
    return NextResponse.json({ earthquakes: [], error: 'Failed to fetch earthquake data' }, { status: 500 });
  }
}
