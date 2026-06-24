import { NextResponse } from 'next/server';
import { INTEL_PATHS, readText, parseCsv, indexMap } from '@/lib/intelSources';
import { centroidFor } from '@/lib/countryCentroids';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS ← EuRepoC global cyber-incident dataset (local CSV).
 * Emits GeoJSON points placed at the receiver country's centroid, deduplicated
 * by incident_id (the CSV is one row per attribution). Query params:
 *   ?since=YYYY  (default 2018)   ?limit=N (default 1500)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = parseInt(url.searchParams.get('since') ?? '2018', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '1500', 10), 5000);

  const text = await readText(INTEL_PATHS.eurepocCsv());
  if (!text) {
    return NextResponse.json(
      { features: [], error: 'EuRepoC dataset not found — check OPENCODE_ROOT' },
      { status: 503 },
    );
  }

  try {
    const { header, rows } = parseCsv(text);
    const ix = indexMap(header);
    const get = (r: string[], k: string) => (ix[k] != null ? (r[ix[k]] ?? '').trim() : '');

    const seen = new Set<string>();
    const features: Array<Record<string, unknown>> = [];
    let placed = 0;

    for (const r of rows) {
      const id = get(r, 'incident_id');
      if (!id || seen.has(id)) continue;

      const start = get(r, 'start_date');
      const year = parseInt((start.match(/\d{4}/) ?? ['0'])[0], 10);
      if (year && year < since) continue;

      const alpha2 = get(r, 'receiver_country_alpha_2_code');
      const c = centroidFor(alpha2);
      if (!c) continue; // unmapped / multi-country incidents skipped on the map
      seen.add(id);

      // Stable per-incident jitter so co-located incidents don't fully overlap.
      const h = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const jLng = ((h % 1000) / 1000 - 0.5) * 3;
      const jLat = (((h >> 10) % 1000) / 1000 - 0.5) * 3;

      const type = get(r, 'incident_type') || 'Cyber incident';
      const color =
        /disrupt|destruct|sabotage|wiper/i.test(type) ? '#D32F2F' :
        /espionage|exfiltration|hijack/i.test(type) ? '#FF6D00' : '#FBC02D';

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c[0] + jLng, c[1] + jLat] },
        properties: {
          id,
          name: get(r, 'name') || `Incident ${id}`,
          incident_type: type,
          start_date: start,
          year,
          receiver_country: get(r, 'receiver_country'),
          receiver_category: get(r, 'receiver_category'),
          initiator_country: get(r, 'initiator_country'),
          initiator_category: get(r, 'initiator_category'),
          color,
          source: 'EuRepoC',
        },
      });
      if (++placed >= limit) break;
    }

    features.sort((a, b) =>
      Number((b.properties as { year: number }).year) - Number((a.properties as { year: number }).year));

    return NextResponse.json(
      { features, stats: { incidents: features.length, since }, source: 'EuRepoC global dataset 1.3 (local)' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } },
    );
  } catch (e) {
    console.error('[OSIRIS] eurepoc error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ features: [], error: 'EuRepoC parse failed' }, { status: 500 });
  }
}
