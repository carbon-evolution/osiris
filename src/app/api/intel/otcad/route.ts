import { NextResponse } from 'next/server';
import { INTEL_PATHS, readText } from '@/lib/intelSources';

export const dynamic = 'force-dynamic';

interface OtcadEntry { name: string; year: number; industry: string; attackType: string; sources?: string[]; guid: string; }

/**
 * OSIRIS ← OTCAD (OT/ICS historical cyberattack catalogue, local JSON).
 * No per-incident geo in the dataset, so this serves a timeline/feed plus
 * rollups by industry and decade for the cyber/intel panels.
 */
export async function GET() {
  const text = await readText(INTEL_PATHS.otcadJson());
  if (!text) {
    return NextResponse.json({ items: [], error: 'OTCAD dataset not found — check OPENCODE_ROOT' }, { status: 503 });
  }
  try {
    const data = JSON.parse(text) as OtcadEntry[];
    const items = data
      .map((e) => ({
        id: e.guid,
        name: e.name,
        year: e.year,
        industry: e.industry,
        attack_type: e.attackType,
        sources: e.sources ?? [],
      }))
      .sort((a, b) => b.year - a.year);

    const byIndustry: Record<string, number> = {};
    const byDecade: Record<string, number> = {};
    for (const i of items) {
      byIndustry[i.industry] = (byIndustry[i.industry] ?? 0) + 1;
      const decade = `${Math.floor(i.year / 10) * 10}s`;
      byDecade[decade] = (byDecade[decade] ?? 0) + 1;
    }

    return NextResponse.json(
      { items, stats: { total: items.length, byIndustry, byDecade }, source: 'OTCAD (local)' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } },
    );
  } catch (e) {
    console.error('[OSIRIS] otcad error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [], error: 'OTCAD parse failed' }, { status: 500 });
  }
}
