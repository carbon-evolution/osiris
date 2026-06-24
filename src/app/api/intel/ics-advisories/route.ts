import { NextResponse } from 'next/server';
import { INTEL_PATHS, readText, parseCsv, indexMap } from '@/lib/intelSources';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS ← ICS-Advisory-Project / CISA ICS-CERT advisories master (local CSV).
 * Feeds the cyber-intel panel with ICS/OT CVEs by vendor, sector and CVSS.
 * Query: ?year=YYYY  ?sector=substr  ?limit=N (default 500)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearFilter = url.searchParams.get('year');
  const sectorFilter = (url.searchParams.get('sector') ?? '').toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 5000);

  const text = await readText(INTEL_PATHS.icsAdvMaster());
  if (!text) {
    return NextResponse.json({ items: [], error: 'ICS advisory master not found — check OPENCODE_ROOT' }, { status: 503 });
  }
  try {
    const { header, rows } = parseCsv(text);
    const ix = indexMap(header);
    const get = (r: string[], k: string) => (ix[k] != null ? (r[ix[k]] ?? '').trim() : '');

    const items = rows
      .map((r) => ({
        id: get(r, 'icsad_ID') || get(r, 'ICS-CERT_Number'),
        advisory: get(r, 'ICS-CERT_Number'),
        title: get(r, 'ICS-CERT_Advisory_Title'),
        vendor: get(r, 'Vendor'),
        product: get(r, 'Product'),
        cve: get(r, 'CVE_Number'),
        cvss: parseFloat(get(r, 'Cumulative_CVSS')) || null,
        severity: get(r, 'CVSS_Severity'),
        cwe: get(r, 'CWE_Number'),
        sector: get(r, 'Critical_Infrastructure_Sector'),
        year: parseInt(get(r, 'Year'), 10) || null,
        released: get(r, 'Original_Release_Date'),
      }))
      .filter((a) => a.id)
      .filter((a) => (yearFilter ? String(a.year) === yearFilter : true))
      .filter((a) => (sectorFilter ? a.sector.toLowerCase().includes(sectorFilter) : true))
      .sort((a, b) => (b.released > a.released ? 1 : -1))
      .slice(0, limit);

    const bySeverity: Record<string, number> = {};
    for (const a of items) if (a.severity) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;

    return NextResponse.json(
      { items, stats: { count: items.length, bySeverity }, source: 'ICS-Advisory-Project / CISA (local)' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } },
    );
  } catch (e) {
    console.error('[OSIRIS] ics-advisories error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [], error: 'ICS advisory parse failed' }, { status: 500 });
  }
}
