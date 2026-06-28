import { withQueryCache } from '@/lib/feeds/serve';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * URLScan.io OSINT lookup
 * Free tier: no API key needed for public scans, 10 req/min limit
 * Proxies the urlscan.io public API for domain/IP/URL scanning
 */
async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  const ip = searchParams.get('ip');
  const url = searchParams.get('url');

  try {
    // Domain search: find all scans for a domain
    if (domain) {
      const res = await fetch(
        `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=10`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `URLScan.io returned ${res.status}`, results: [] },
          { status: res.status === 429 ? 429 : 502 }
        );
      }
      const data = await res.json();
      return NextResponse.json({
        source: 'urlscan.io',
        query: domain,
        type: 'domain',
        total: data.total || 0,
        results: (data.results || []).map((r: any) => ({
          scan_id: r._id,
          url: r.page?.url || '',
          domain: r.page?.domain || '',
          ip: r.page?.ip || '',
          asn: r.page?.asn || '',
          asnname: r.page?.asnname || '',
          country: r.page?.country || '',
          server: r.page?.server || '',
          status: r.page?.status || null,
          screenshot: r.screenshot ? `https://urlscan.io/screenshots/${r._id}.png` : null,
          task_time: r.task?.time || '',
          verdicts: r.verdicts || {},
          malicious: r.verdicts?.overall?.malicious || false,
        })),
        timestamp: new Date().toISOString(),
      });
    }

    // IP search: find recent scans involving this IP
    if (ip) {
      const res = await fetch(
        `https://urlscan.io/api/v1/search/?q=ip:${encodeURIComponent(ip)}&size=10`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `URLScan.io returned ${res.status}`, results: [] },
          { status: res.status === 429 ? 429 : 502 }
        );
      }
      const data = await res.json();
      return NextResponse.json({
        source: 'urlscan.io',
        query: ip,
        type: 'ip',
        total: data.total || 0,
        results: (data.results || []).map((r: any) => ({
          scan_id: r._id,
          url: r.page?.url || '',
          domain: r.page?.domain || '',
          ip: r.page?.ip || '',
          asn: r.page?.asn || '',
          country: r.page?.country || '',
          server: r.page?.server || '',
          status: r.page?.status || null,
          task_time: r.task?.time || '',
          verdicts: r.verdicts || {},
          malicious: r.verdicts?.overall?.malicious || false,
        })),
        timestamp: new Date().toISOString(),
      });
    }

    // Direct URL/scan lookup: get a specific scan result
    if (url) {
      const scanId = url; // passed as scan UUID
      const res = await fetch(
        `https://urlscan.io/api/v1/result/${encodeURIComponent(scanId)}/`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `URLScan.io returned ${res.status}` },
          { status: res.status === 404 ? 404 : 502 }
        );
      }
      const data = await res.json();
      return NextResponse.json({
        source: 'urlscan.io',
        scan_id: scanId,
        url: data.page?.url || '',
        domain: data.page?.domain || '',
        ip: data.page?.ip || '',
        asn: data.page?.asn || data.page?.asnname || '',
        country: data.page?.country || '',
        server: data.page?.server || '',
        status: data.page?.status || null,
        screenshot: `https://urlscan.io/screenshots/${scanId}.png`,
        dom_url: data.page?.domURL || '',
        console_log: `https://urlscan.io/console/${scanId}/`,
        verdicts: data.verdicts || {},
        malicious: data.verdicts?.overall?.malicious || false,
        brands: data.verdicts?.brands || [],
        page_domain: data.page?.domain || '',
        page_ip: data.page?.ip || '',
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Provide one of: ?domain=example.com, ?ip=1.2.3.4, ?url=<scan_id>' },
      { status: 400 }
    );
  } catch (e) {
    console.warn('[OSIRIS] URLScan.io error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'URLScan.io lookup failed', results: [] },
      { status: 502 }
    );
  }
}

export const GET = withQueryCache('osint/urlscan', 21600000, _GET);
