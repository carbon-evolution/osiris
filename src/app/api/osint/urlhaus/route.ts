import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * URLhaus (abuse.ch) — Individual Malware URL / Host / Payload Lookup
 * Free API, no key required for public endpoints.
 * 
 * Endpoints:
 *   /v1/host/<host>        — all URLs known for a host (IP or domain)
 *   /v1/url/<url>           — single URL status
 *   /v1/payload/<hash>      — payload/hash details (MD5/SHA1/SHA256)
 * 
 * Docs: https://urlhaus-api.abuse.ch/
 */
const URLHAUS_API = 'https://urlhaus-api.abuse.ch/v1';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const host = searchParams.get('host');
  const url = searchParams.get('url');
  const hash = searchParams.get('hash');

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // No params: show status
    if (!host && !url && !hash) {
      return NextResponse.json({
        source: 'URLhaus (abuse.ch)',
        status: 'available',
        usage: '/api/osint/urlhaus?host=example.com | ?url=https://... | ?hash=md5_or_sha256',
        timestamp: new Date().toISOString(),
      });
    }

    // ── Host lookup (IP or domain) ──
    if (host) {
      const res = await fetch(`${URLHAUS_API}/host/${encodeURIComponent(host)}/`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('URLhaus rate limited');
        throw new Error(`URLhaus returned ${res.status}`);
      }
      const data = await res.json();
      const queryStatus = data.query_status;
      if (queryStatus === 'no_results') {
        return NextResponse.json({
          source: 'URLhaus (abuse.ch)',
          query: host,
          type: 'host',
          malicious: false,
          total_urls: 0,
          urls: [],
          timestamp: new Date().toISOString(),
        });
      }

      const urls = (data.urls || []).slice(0, 50).map((u: any) => ({
        id: u.id || '',
        url: u.url || '',
        threat: u.threat || '',
        status: u.url_status || '',
        host: u.host || '',
        date_added: u.date_added || '',
        last_online: u.last_online || '',
        filename: u.filename || '',
        payload: u.payload ? {
          md5: u.payload.md5 || '',
          sha1: u.payload.sha1 || '',
          sha256: u.payload.sha256 || '',
          file_type: u.payload.file_type || '',
          signature: u.payload.signature || '',
        } : null,
      }));

      return NextResponse.json({
        source: 'URLhaus (abuse.ch)',
        query: host,
        type: 'host',
        malicious: urls.length > 0,
        total_urls: urls.length,
        urlhaus_reference: `https://urlhaus.abuse.ch/host/${encodeURIComponent(host)}/`,
        urls,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Single URL lookup ──
    if (url) {
      const res = await fetch(`${URLHAUS_API}/url/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({ url }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('URLhaus rate limited');
        throw new Error(`URLhaus returned ${res.status}`);
      }
      const data = await res.json();
      const queryStatus = data.query_status;

      if (queryStatus === 'no_results') {
        return NextResponse.json({
          source: 'URLhaus (abuse.ch)',
          query: url,
          type: 'url',
          malicious: false,
          found: false,
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        source: 'URLhaus (abuse.ch)',
        query: url,
        type: 'url',
        malicious: true,
        found: true,
        urlhaus_id: data.id || '',
        urlhaus_reference: data.urlhaus_reference || '',
        threat: data.threat || '',
        status: data.url_status || '',
        host: data.host || '',
        date_added: data.date_added || '',
        last_online: data.last_online || '',
        filename: data.filename || '',
        payload: data.payload ? {
          md5: data.payload.md5 || '',
          sha1: data.payload.sha1 || '',
          sha256: data.payload.sha256 || '',
          file_type: data.payload.file_type || '',
          signature: data.payload.signature || '',
        } : null,
        tags: data.tags || [],
        timestamp: new Date().toISOString(),
      });
    }

    // ── Payload (hash) lookup ──
    if (hash) {
      const res = await fetch(`${URLHAUS_API}/payload/${encodeURIComponent(hash)}/`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('URLhaus rate limited');
        throw new Error(`URLhaus returned ${res.status}`);
      }
      const data = await res.json();
      const queryStatus = data.query_status;

      if (queryStatus === 'no_results') {
        return NextResponse.json({
          source: 'URLhaus (abuse.ch)',
          query: hash,
          type: 'hash',
          malicious: false,
          found: false,
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        source: 'URLhaus (abuse.ch)',
        query: hash,
        type: 'hash',
        malicious: true,
        found: true,
        md5: data.md5_hash || '',
        sha1: data.sha1_hash || '',
        sha256: data.sha256_hash || '',
        file_type: data.file_type || '',
        signature: data.signature || '',
        first_seen: data.firstseen || '',
        last_seen: data.lastseen || '',
        tags: data.tags || [],
        urls: (data.urls || []).slice(0, 20).map((u: any) => ({
          url: u.url || '',
          threat: u.threat || '',
          status: u.url_status || '',
          date_added: u.date_added || '',
          last_online: u.last_online || '',
        })),
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Provide one of: ?host=domain.com, ?url=https://..., ?hash=md5_or_sha256' },
      { status: 400 }
    );
  } catch (e) {
    console.warn('[OSIRIS] URLhaus error:', e instanceof Error ? e.message : e);
    return NextResponse.json({
      source: 'URLhaus (abuse.ch)',
      error: 'URLhaus lookup failed',
      details: e instanceof Error ? e.message : 'unknown',
      timestamp: new Date().toISOString(),
    }, { status: 502 });
  }
}
