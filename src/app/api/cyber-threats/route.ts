import { NextResponse } from 'next/server';
import { readFresh } from '@/lib/feedStore';

// Cyber threat intelligence from public feeds
// Inspired by WorldMonitor's infrastructure tracking
// Local-first: serves locally-synced CISA KEV (workers) when fresh, else live.

export async function GET() {
  // ── Local-first: synced CISA KEV from Postgres ──
  if (process.env.LOCAL_FIRST !== 'false') {
    try {
      const local = await readFresh('kev', 24 * 60 * 60 * 1000); // 24h freshness
      if (local.length > 0) {
        const threats = local
          .filter(r => {
            const added = new Date(String(r.data.dateAdded));
            return (Date.now() - added.getTime()) / (1000 * 60 * 60 * 24) <= 30;
          })
          .slice(0, 10)
          .map(r => ({
            id: r.uid,
            name: r.data.name,
            vendor: r.data.vendor,
            product: r.data.product,
            severity: 'CRITICAL',
            date: r.data.dateAdded,
            source: 'CISA KEV (local)',
          }));
        return NextResponse.json({
          threats,
          stats: {
            cisa_total: local.length,
            active_cves: threats.length,
            threat_level: threats.length >= 8 ? 'CRITICAL' : threats.length >= 4 ? 'HIGH' : 'ELEVATED',
            source: 'local',
          },
          timestamp: new Date().toISOString(),
        }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
      }
    } catch (e) {
      console.warn('[OSIRIS] local KEV read failed, falling back to live:', e instanceof Error ? e.message : e);
    }
  }

  try {
    const results: any = { threats: [], stats: {}, timestamp: new Date().toISOString() };

    // 1. CISA Known Exploited Vulnerabilities (authoritative US govt source)
    try {
      const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
        
      });
      if (res.ok) {
        const data = await res.json();
        const recent = (data.vulnerabilities || [])
          .filter((v: any) => {
            const added = new Date(v.dateAdded);
            const daysAgo = (Date.now() - added.getTime()) / (1000 * 60 * 60 * 24);
            return daysAgo <= 30;
          })
          .slice(0, 10)
          .map((v: any) => ({
            id: v.cveID,
            name: v.vulnerabilityName,
            vendor: v.vendorProject,
            product: v.product,
            severity: 'CRITICAL',
            date: v.dateAdded,
            due: v.dueDate,
            source: 'CISA KEV',
          }));
        results.threats.push(...recent);
        results.stats.cisa_total = data.vulnerabilities?.length || 0;
      }
    } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }

    // 2. Shadowserver honeypot stats (global attack surface)
    try {
      const res = await fetch('https://dashboard.shadowserver.org/statistics/combined/map/', {
        
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        results.stats.shadowserver = 'active';
      }
    } catch {
      results.stats.shadowserver = 'unavailable';
    }

    // 3. Aggregate stats
    results.stats.active_cves = results.threats.length;
    results.stats.threat_level = results.threats.length >= 8 ? 'CRITICAL' : results.threats.length >= 4 ? 'HIGH' : 'ELEVATED';

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ threats: [], stats: {}, error: 'Failed' }, { status: 500 });
  }
}
