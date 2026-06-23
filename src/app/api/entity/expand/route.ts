import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

const INTEL_URL = process.env.INTEL_URL || (
  process.env.NODE_ENV === 'production'
    ? 'http://osiris-intel:4000'
    : 'http://localhost:4000'
);

const ALLOWED_TYPES = new Set(['aircraft', 'vessel', 'company', 'person', 'ip', 'country', 'apt', 'cve']);

const APT_TECHNIQUES: Record<string, string> = {
  T1190: 'Exploit Public-Facing Application',
  T1566: 'Phishing',
  T1059: 'Command and Scripting Interpreter',
  T1090: 'Proxy',
  T1071: 'Application Layer Protocol',
  T1005: 'Data from Local System',
  T1204: 'User Execution',
};

const APT_GROUPS: Record<string, { name: string; country: string; techniques: string[] }> = {
  G0016: { name: 'APT29', country: 'RU', techniques: ['T1190', 'T1566', 'T1059'] },
  G0007: { name: 'APT28', country: 'RU', techniques: ['T1190', 'T1566', 'T1090'] },
  G0080: { name: 'Lazarus Group', country: 'KP', techniques: ['T1204', 'T1059', 'T1566'] },
  G0032: { name: 'Turla', country: 'RU', techniques: ['T1190', 'T1090', 'T1071'] },
  G0045: { name: 'Cozy Bear', country: 'RU', techniques: ['T1566', 'T1059', 'T1005'] },
};

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 30, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || '').toLowerCase().trim();
  const id = (searchParams.get('id') || '').trim();

  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json(
      { error: `Invalid type. Allowed: ${[...ALLOWED_TYPES].join(', ')}` },
      { status: 400 },
    );
  }
  if (!id || id.length < 2 || id.length > 200) {
    return NextResponse.json({ error: 'Invalid id (2-200 chars)' }, { status: 400 });
  }

  if (type === 'apt') {
    const groupId = id.startsWith('G') ? id.toUpperCase() : null;
    const group = groupId ? APT_GROUPS[groupId] : null;
    if (!group) {
      return NextResponse.json({ nodes: [], links: [] });
    }
    const techniqueNodes = group.techniques.map((tId: string) => ({
      id: `technique:${tId}`,
      label: `${tId}: ${APT_TECHNIQUES[tId] || tId}`,
      type: 'event' as const,
      properties: { technique_id: tId, technique_name: APT_TECHNIQUES[tId] || tId },
    }));
    const links = techniqueNodes.map((n: any) => ({ source: `apt:${groupId}`, target: n.id, label: 'uses' }));
    return NextResponse.json({ nodes: techniqueNodes, links });
  }

  if (type === 'cve') {
    return NextResponse.json({ nodes: [], links: [] });
  }

  try {
    const params = new URLSearchParams({ type, id });
    for (const key of ['registration', 'model', 'icao24']) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }
    const res = await fetch(`${INTEL_URL}/resolve?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { 'X-Forwarded-For': clientIp },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: body.error || `Intel layer returned ${res.status}`, nodes: [], links: [] },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (e) {
    console.error('[OSIRIS] Intel proxy error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Intelligence layer unavailable', nodes: [], links: [] },
      { status: 502 },
    );
  }
}
