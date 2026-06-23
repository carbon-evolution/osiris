import type { CctvCamera } from './types';

// ── Hong Kong Transport Department Traffic Cameras (no API key required) ──
// Source: Hong Kong Transport Department (HK TD) — 運輸署
//   CSV: https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv
//   Tab-delimited columns: key, region, district, description, easting, northing, latitude, longitude, url
//   Images: https://tdcctv.data.one.gov.hk/{KEY}.JPG (static JPG snapshots)

const CACHE_TTL_MS = 5 * 60 * 1000;
const CSV_URL = 'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv';

interface CsvRow {
  key: string;
  region: string;
  district: string;
  description: string;
  latitude: number;
  longitude: number;
  url: string;
}

function parseCsvRow(line: string): CsvRow | null {
  const cols = line.split('\t');
  if (cols.length < 9) return null;

  const key = cols[0]?.trim();
  const region = cols[1]?.trim() ?? '';
  const district = cols[2]?.trim() ?? '';
  const description = cols[3]?.trim() ?? '';
  const lat = parseFloat(cols[6]);
  const lng = parseFloat(cols[7]);
  const url = cols[8]?.trim() ?? '';

  if (!key || isNaN(lat) || isNaN(lng)) return null;

  return { key, region, district, description, latitude: lat, longitude: lng, url };
}

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header row
    if (trimmed.startsWith('key\t') || trimmed.startsWith('key,')) continue;

    const row = parseCsvRow(trimmed);
    if (!row) continue;
    if (seen.has(row.key)) continue;
    seen.add(row.key);

    rows.push(row);
  }

  return rows;
}

let cached: CctvCamera[] | null = null;
let cacheTs = 0;

/**
 * Fetch Hong Kong traffic cameras from the Transport Department.
 * Source: CSV of camera locations with static JPG snapshot URLs.
 * No API key required — completely public data.
 */
export async function fetchHongKongCameras(): Promise<CctvCamera[]> {
  if (cached && Date.now() - cacheTs < CACHE_TTL_MS) return cached;

  try {
    const res = await fetch(CSV_URL, {
      signal: AbortSignal.timeout(15000),
      cache: 'force-cache',
    });
    if (!res.ok) return [];

    const text = await res.text();
    const rows = parseCsv(text);

    const cameras: CctvCamera[] = rows.map((row) => {
      const name = row.description || `${row.district}, ${row.region}`;

      return {
        id: `hk-${row.key}`,
        lat: row.latitude,
        lng: row.longitude,
        name,
        city: row.district,
        country: 'Hong Kong',
        feed_url: row.url,
        stream_type: 'jpg',
        source: 'HK TD',
      };
    });

    cached = cameras;
    cacheTs = Date.now();
    return cameras;
  } catch {
    return [];
  }
}
