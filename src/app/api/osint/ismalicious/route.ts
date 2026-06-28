import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * isMalicious — Real-Time Threat Intelligence Lookup
 * Check IPs, domains, URLs, and file hashes for malicious activity.
 * Uses the ismalicious.com API (free tier: 1,000 req/month).
 * 
 * Set ISMALICIOUS_KEY in .env.local (get at https://ismalicious.com)
 * Auth: X-API-KEY header = base64("YOUR_KEY:")
 * 
 * Docs: https://docs.ismalicious.com/technical-docs/api-reference/check-ressource
 */
const ISMALICIOUS_API = 'https://api.ismalicious.com';
const API_KEY = (typeof process !== 'undefined' && process.env && process.env.ISMALICIOUS_KEY) || '';

function buildAuthHeader(): Record<string, string> {
  if (!API_KEY) return {};
  const encoded = Buffer.from(`${API_KEY}:`).toString('base64');
  return { 'X-API-KEY': encoded };
}

async function ismFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${ISMALICIOUS_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      ...buildAuthHeader(),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited by isMalicious');
    if (res.status === 401 || res.status === 403) {
      throw new Error('isMalicious API key invalid or expired — get a new free key at https://ismalicious.com and set ISMALICIOUS_KEY in .env.local');
    }
    throw new Error(`isMalicious returned ${res.status}`);
  }
  return res.json();
}

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  const enrichment = searchParams.get('enrichment') || 'standard';

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // No query: return API status info
    if (!query) {
      return NextResponse.json({
        source: 'isMalicious',
        api_key_configured: !!API_KEY,
        status: API_KEY ? 'configured' : 'no API key set (free at https://ismalicious.com)',
        usage: '/api/osint/ismalicious?query=example.com&enrichment=basic|standard|full',
        timestamp: new Date().toISOString(),
      });
    }

    const data = await ismFetch('/check', { query, enrichment });

    // Transform response into a consistent structure
    const result: any = {
      source: 'isMalicious',
      query,
      type: data.type || 'UNKNOWN',
      malicious: data.malicious || false,
      risk_score: data.riskScore ?? null,
      api_key_configured: !!API_KEY,
      timestamp: new Date().toISOString(),
    };

    // Reputation breakdown (VirusTotal-style)
    if (data.reputation) {
      result.reputation = {
        malicious: data.reputation.malicious ?? 0,
        suspicious: data.reputation.suspicious ?? 0,
        harmless: data.reputation.harmless ?? 0,
        undetected: data.reputation.undetected ?? 0,
        total: (data.reputation.malicious ?? 0) +
               (data.reputation.suspicious ?? 0) +
               (data.reputation.harmless ?? 0) +
               (data.reputation.undetected ?? 0),
      };
    }

    // Blocklist sources that flagged this entity
    if (data.sources && Array.isArray(data.sources)) {
      result.blocklist_sources = data.sources.map((s: any) => ({
        name: s.name || '',
        category: s.category || '',
        status: s.status || '',
        type: s.type || '',
        url: s.url || '',
      }));
      result.total_blocklists = result.blocklist_sources.length;
    }

    // WHOIS enrichment (available with standard+ enrichment)
    if (data.whois) {
      const w = data.whois;
      result.whois = {
        domain: w.domain?.domain || '',
        registrar: w.registrar || w.domain?.registrar || '',
        created_date: w.domain?.created_date || '',
        expiration_date: w.domain?.expiration_date || '',
        updated_date: w.domain?.updated_date || '',
        name_servers: Array.isArray(w.domain?.name_servers) ? w.domain.name_servers : [],
        status: Array.isArray(w.domain?.status) ? w.domain.status : [],
      };
    }

    // Geo / ASN enrichment (available for IP lookups)
    if (data.geo) {
      result.geo = {
        country: data.geo.country || '',
        country_code: data.geo.country_code || '',
        city: data.geo.city || '',
        isp: data.geo.isp || '',
        org: data.geo.org || '',
        as_number: data.geo.asn || data.geo.as_number || '',
      };
    }

    // OTX enrichment (standard+ enrichment)
    if (data.otx) {
      result.otx = {
        reputation_score: data.otx.reputationScore ?? null,
        pulse_count: data.otx.pulseCount ?? 0,
        pulses: Array.isArray(data.otx.pulses) ? data.otx.pulses.slice(0, 5).map((p: any) => ({
          name: p.name || '',
          description: p.description?.slice(0, 200) || '',
          created: p.created || '',
          tags: p.tags || [],
          adversary: p.adversary || '',
        })) : [],
      };
    }

    // LevelBlue Labs reputation (full enrichment for IPs)
    if (data.labsReputation) {
      result.labs_reputation = {
        score: data.labsReputation.score ?? null,
        classification: data.labsReputation.classification || '',
        last_updated: data.labsReputation.lastUpdated || '',
      };
    }

    // Passive DNS (full enrichment)
    if (data.passiveDns && Array.isArray(data.passiveDns)) {
      result.passive_dns = data.passiveDns.slice(0, 20).map((p: any) => ({
        hostname: p.hostname || p.value || '',
        record_type: p.recordType || p.type || '',
        first_seen: p.firstSeen || '',
        last_seen: p.lastSeen || '',
      }));
    }

    // File analysis (full enrichment for hash lookups)
    if (data.fileAnalysis) {
      result.file_analysis = {
        md5: data.fileAnalysis.md5 || '',
        sha1: data.fileAnalysis.sha1 || '',
        sha256: data.fileAnalysis.sha256 || '',
        file_type: data.fileAnalysis.fileType || '',
        file_name: data.fileAnalysis.fileName || '',
        signature: data.fileAnalysis.signature || '',
        first_seen: data.fileAnalysis.firstSeen || '',
        tags: data.fileAnalysis.tags || [],
      };
    }

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.warn('[OSIRIS] isMalicious error:', msg);
    const keyIssue = /key invalid|expired|missing/i.test(msg);
    return NextResponse.json({
      source: 'isMalicious',
      query: searchParams.get('query') || '',
      error: keyIssue ? msg : 'isMalicious lookup failed',
      details: msg,
      needs_key: keyIssue,
      api_key_configured: !!API_KEY,
      malicious: null,
      timestamp: new Date().toISOString(),
    }, { status: keyIssue ? 503 : 502 });
  }
}

export const GET = withQueryCache('osint/ismalicious', 21600000, _GET);
