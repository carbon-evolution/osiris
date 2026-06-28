import { withQueryCache } from '@/lib/feeds/serve';
import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for IP geolocation — avoids mixed-content block on HTTPS pages
// Uses ipapi.co (HTTPS) as primary, with ip-api.com (HTTP) as fallback
async function _GET(request: NextRequest) {
  try {
    // Extract the real client IP from standard proxy headers
    const clientIp =
      request.headers.get('cf-connecting-ip') ||        // Cloudflare
      request.headers.get('x-real-ip') ||                // Nginx / generic
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '';

    // Skip private/loopback IPs — let the API auto-detect
    const isPrivate = !clientIp || clientIp === '::1' || clientIp === '127.0.0.1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');
    const ipSegment = isPrivate ? '' : `${clientIp}/`;

    // Primary: ipapi.co (HTTPS, free tier 1000/day)
    try {
      const res = await fetch(`https://ipapi.co/${ipSegment}json/`, {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
        headers: { 'User-Agent': 'OSIRIS/4.2' },
      });
      if (res.ok) {
        const d = await res.json();
        if (!d.error) {
          return NextResponse.json({
            status: 'success',
            query: d.ip,
            lat: d.latitude,
            lon: d.longitude,
            city: d.city,
            regionName: d.region,
            country: d.country_name,
            isp: d.org || 'Unknown',
            org: d.org || 'Unknown',
            as: d.asn ? `AS${d.asn} ${d.org}` : 'Unknown',
          });
        }
      }
    } catch { /* fall through to backup */ }

    // Fallback: ip-api.com (HTTP only, 45/min)
    const fallbackUrl = isPrivate
      ? 'http://ip-api.com/json/?fields=status,lat,lon,city,regionName,country,query,isp,org,as'
      : `http://ip-api.com/json/${clientIp}?fields=status,lat,lon,city,regionName,country,query,isp,org,as`;

    const res = await fetch(fallbackUrl, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to reach geolocation service', detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}

export const GET = withQueryCache('geo', 86400000, _GET);
