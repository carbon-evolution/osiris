import { NextResponse } from 'next/server';
import { INTEL_SERVICES } from '@/lib/intelSources';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS ← DefectDojo (vulnerability management) running locally on :8080.
 * Proxies active findings into the cyber panel. Requires a read token in
 * DEFECTDOJO_TOKEN (DefectDojo → API v2 key); degrades gracefully if the
 * service is down or no token is set.
 * ?severity=Critical|High|...  ?limit=N (default 100)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const severity = url.searchParams.get('severity');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
  const token = process.env.DEFECTDOJO_TOKEN;

  if (!token) {
    return NextResponse.json(
      { findings: [], note: 'Set DEFECTDOJO_TOKEN (DefectDojo API v2 key) to enable this layer.' },
      { status: 200 },
    );
  }

  const qs = new URLSearchParams({ active: 'true', limit: String(limit) });
  if (severity) qs.set('severity', severity);
  const api = `${INTEL_SERVICES.defectdojo}/api/v2/findings/?${qs.toString()}`;

  try {
    const res = await fetch(api, {
      headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ findings: [], error: `DefectDojo ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const findings = (data.results ?? []).map((f: Record<string, unknown>) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      cve: f.cve ?? null,
      cwe: f.cwe ?? null,
      product: f.product ?? null,
      found_by: f.found_by ?? null,
      date: f.date ?? null,
    }));
    return NextResponse.json({ findings, count: data.count ?? findings.length, source: 'DefectDojo (local :8080)' });
  } catch (e) {
    console.error('[OSIRIS] defectdojo error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ findings: [], error: 'DefectDojo unreachable (is it running on :8080?)' }, { status: 503 });
  }
}
