import { withCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import * as h3 from 'h3-js';

export const dynamic = 'force-dynamic';

const GPSJAM_URL = 'https://gpsjam.org/data';

function getDateStr(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function _GET() {
  try {
    const dateStr = getDateStr();
    const url = `${GPSJAM_URL}/${dateStr}-h3_4.csv`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      // Try previous day
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      const fallbackUrl = `${GPSJAM_URL}/${yStr}-h3_4.csv`;
      const fbRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(10000) });
      if (!fbRes.ok) {
        return NextResponse.json({ features: [], stats: { cells: 0, high: 0, medium: 0 }, date: yStr, error: 'No GPS jam data available' }, { status: 503 });
      }
      const text = await fbRes.text();
      return processData(text, yStr);
    }

    const text = await res.text();
    return processData(text, dateStr);
  } catch (error) {
    console.error('[OSIRIS] GPS jamming error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ features: [], error: 'GPS jamming unavailable' }, { status: 500 });
  }
}

function processData(csv: string, dateStr: string) {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) {
    return NextResponse.json({ features: [], stats: { cells: 0, high: 0, medium: 0 }, date: dateStr }, {
      headers: { 'Cache-Control': 'public, s-maxage=600' },
    });
  }

  const features: any[] = [];
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Skip header row — CSV: hex,count_good_aircraft,count_bad_aircraft
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;

    const h3Index = parts[0].trim();
    const good = parseInt(parts[1], 10);
    const bad = parseInt(parts[2], 10);
    const total = good + bad;
    if (total < 5) continue; // Skip cells with too few samples

    const ratio = bad / total;
    let severity: string;
    let color: string;
    let opacity: number;

    if (ratio > 0.10) {
      severity = 'high';
      color = '#D32F2F';
      opacity = 0.35;
      highCount++;
    } else if (ratio > 0.02) {
      severity = 'medium';
      color = '#FF6D00';
      opacity = 0.25;
      mediumCount++;
    } else {
      severity = 'low';
      color = '#4CAF50';
      opacity = 0.1;
      lowCount++;
    }

    const center = h3.cellToLatLng(h3Index);
    const boundary = h3.cellToBoundary(h3Index, true); // GeoJSON [lng, lat] format

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [boundary],
      },
      properties: {
        severity,
        color,
        opacity,
        total_aircraft: total,
        bad_aircraft: bad,
        ratio: Math.round(ratio * 1000) / 1000,
        label: `${(ratio * 100).toFixed(1)}% interference`,
        center_lng: center[1],
        center_lat: center[0],
      },
    });
  }

  return NextResponse.json({
    features,
    stats: { cells: features.length, high: highCount, medium: mediumCount, low: lowCount },
    date: dateStr,
    source: 'gpsjam.org (CC-BY John Wiseman / ADS-B Exchange)',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
  });
}

export const GET = withCache('gps-jamming', 600000, _GET);
