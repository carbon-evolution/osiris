import { withQueryCache } from '@/lib/feeds/serve';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * AlienVault OTX (Open Threat Exchange) OSINT lookup
 * Free tier: API key required (free signup at https://otx.alienvault.com)
 * Set OTX_API_KEY in environment variables
 * Endpoints: domain, IP, URL, hostname pulses + general info
 */
const OTX_BASE = 'https://otx.alienvault.com/api/v1';
const API_KEY = (typeof process !== 'undefined' && process.env && process.env.OTX_API_KEY) || '';

async function otxFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (API_KEY) {
    headers['X-OTX-API-KEY'] = API_KEY;
  }
  const res = await fetch(`${OTX_BASE}${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('OTX API key required or invalid');
    if (res.status === 429) throw new Error('OTX rate limited');
    throw new Error(`OTX returned ${res.status}`);
  }
  return res.json();
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  const ip = searchParams.get('ip');
  const hostname = searchParams.get('hostname');

  try {
    // Domain intelligence: geo, categories, whois, related samples
    if (domain) {
      const [general, geo, malware, urlList] = await Promise.all([
        otxFetch(`/indicators/domain/${encodeURIComponent(domain)}/general`).catch(() => null),
        otxFetch(`/indicators/domain/${encodeURIComponent(domain)}/geo`).catch(() => null),
        otxFetch(`/indicators/domain/${encodeURIComponent(domain)}/malware`).catch(() => null),
        otxFetch(`/indicators/domain/${encodeURIComponent(domain)}/url_list?limit=10`).catch(() => null),
      ]);

      return NextResponse.json({
        source: 'AlienVault OTX',
        query: domain,
        type: 'domain',
        api_key_configured: !!API_KEY,
        general: general ? {
          indicator: general.indicator || '',
          title: general.title || '',
          description: general.description || '',
          pulses: (general.pulse_info?.pulses || []).slice(0, 5).map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description?.slice(0, 200) || '',
            tags: p.tags || [],
            created: p.created || '',
            tlp: p.tlp || '',
          })),
          validation: general.validation || [],
          base_indicator: general.base_indicator?.indicator || '',
          type: general.type || '',
          type_title: general.type_title || '',
        } : null,
        geo: geo ? {
          country: geo.country || '',
          country_code: geo.country_code || '',
          city: geo.city || '',
          latitude: geo.latitude || null,
          longitude: geo.longitude || null,
          asn: geo.asn || null,
        } : null,
        malware_samples: (malware?.data || []).slice(0, 5).map((s: any) => ({
          hash: s.hash || '',
          date: s.date || '',
          detections: s.detections || 0,
        })),
        related_urls: (urlList?.url_list || []).slice(0, 10).map((u: any) => ({
          url: u.url || '',
          date: u.date || '',
          domain: u.domain || '',
          result: u.result?.urlworker?.url || '',
        })),
        timestamp: new Date().toISOString(),
      });
    }

    // IP intelligence: geo, threat categories, related samples, URL list
    if (ip) {
      const [general, geo, malware, urlList] = await Promise.all([
        otxFetch(`/indicators/IPv4/${encodeURIComponent(ip)}/general`).catch(() => null),
        otxFetch(`/indicators/IPv4/${encodeURIComponent(ip)}/geo`).catch(() => null),
        otxFetch(`/indicators/IPv4/${encodeURIComponent(ip)}/malware`).catch(() => null),
        otxFetch(`/indicators/IPv4/${encodeURIComponent(ip)}/url_list?limit=10`).catch(() => null),
      ]);

      return NextResponse.json({
        source: 'AlienVault OTX',
        query: ip,
        type: 'ip',
        api_key_configured: !!API_KEY,
        general: general ? {
          indicator: general.indicator || '',
          title: general.title || '',
          description: general.description || '',
          pulses: (general.pulse_info?.pulses || []).slice(0, 5).map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description?.slice(0, 200) || '',
            tags: p.tags || [],
            created: p.created || '',
          })),
          type: general.type || '',
          type_title: general.type_title || '',
        } : null,
        geo: geo ? {
          country: geo.country || '',
          country_code: geo.country_code || '',
          city: geo.city || '',
          latitude: geo.latitude || null,
          longitude: geo.longitude || null,
          asn: geo.asn || null,
        } : null,
        malware_samples: (malware?.data || []).slice(0, 5).map((s: any) => ({
          hash: s.hash || '',
          date: s.date || '',
          detections: s.detections || 0,
        })),
        related_urls: (urlList?.url_list || []).slice(0, 10).map((u: any) => ({
          url: u.url || '',
          date: u.date || '',
          domain: u.domain || '',
        })),
        timestamp: new Date().toISOString(),
      });
    }

    // Hostname pulses: recent threat pulses mentioning this hostname
    if (hostname) {
      const pulses = await otxFetch(`/indicators/hostname/${encodeURIComponent(hostname)}/general`).catch(() => null);

      return NextResponse.json({
        source: 'AlienVault OTX',
        query: hostname,
        type: 'hostname',
        api_key_configured: !!API_KEY,
        general: pulses ? {
          indicator: pulses.indicator || '',
          title: pulses.title || '',
          description: pulses.description || '',
          pulses: (pulses.pulse_info?.pulses || []).slice(0, 5).map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description?.slice(0, 200) || '',
            tags: p.tags || [],
            created: p.created || '',
          })),
        } : null,
        timestamp: new Date().toISOString(),
      });
    }

    // No params: show API status
    return NextResponse.json({
      source: 'AlienVault OTX',
      api_key_configured: !!API_KEY,
      status: API_KEY ? 'configured' : 'no API key set (free at https://otx.alienvault.com)',
      usage: '/api/osint/otx?domain=example.com | ?ip=1.2.3.4 | ?hostname=example.com',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[OSIRIS] OTX error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'OTX lookup failed', api_key_configured: !!API_KEY, details: e instanceof Error ? e.message : 'unknown' },
      { status: 502 }
    );
  }
}

export const GET = withQueryCache('osint/otx', 21600000, _GET);
