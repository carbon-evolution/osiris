import { NextRequest, NextResponse } from 'next/server';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
};

function json(data: Record<string, unknown>) {
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}

function decodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    !ip ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80:')
  );
}

// IP geolocation for map centering / self-track.
// Prefer Vercel's request geolocation headers so production does not depend on
// a third-party service. External lookups are HTTPS-only fallbacks for local or
// non-Vercel deployments.
export async function GET(request: NextRequest) {
  try {
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '';

    // Vercel injects these headers at the edge. Require both raw headers before
    // parsing them: Number(null) is 0, which would otherwise create a false
    // (0, 0) location when the headers are absent.
    const vercelLatHeader = request.headers.get('x-vercel-ip-latitude');
    const vercelLonHeader = request.headers.get('x-vercel-ip-longitude');
    const vercelLat = vercelLatHeader === null ? Number.NaN : Number(vercelLatHeader);
    const vercelLon = vercelLonHeader === null ? Number.NaN : Number(vercelLonHeader);
    if (
      vercelLatHeader !== null &&
      vercelLonHeader !== null &&
      Number.isFinite(vercelLat) &&
      Number.isFinite(vercelLon)
    ) {
      return json({
        status: 'success',
        query: clientIp || 'local',
        lat: vercelLat,
        lon: vercelLon,
        city: decodeHeader(request.headers.get('x-vercel-ip-city')) || 'Unknown',
        regionName: decodeHeader(request.headers.get('x-vercel-ip-country-region')) || 'Unknown',
        country: request.headers.get('x-vercel-ip-country') || 'Unknown',
        isp: 'Unknown',
        org: 'Unknown',
        as: 'Unknown',
        source: 'vercel',
      });
    }

    const privateIp = isPrivateIp(clientIp);
    const ipSegment = privateIp ? '' : `${encodeURIComponent(clientIp)}/`;

    // First external fallback: ipapi.co over HTTPS.
    try {
      const res = await fetch(`https://ipapi.co/${ipSegment}json/`, {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
        headers: { 'User-Agent': 'OSIRIS/4.2' },
      });
      if (res.ok) {
        const d = await res.json();
        if (!d.error && Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))) {
          return json({
            status: 'success',
            query: d.ip || clientIp || 'local',
            lat: Number(d.latitude),
            lon: Number(d.longitude),
            city: d.city || 'Unknown',
            regionName: d.region || 'Unknown',
            country: d.country_name || d.country || 'Unknown',
            isp: d.org || 'Unknown',
            org: d.org || 'Unknown',
            as: d.asn ? `${String(d.asn).startsWith('AS') ? '' : 'AS'}${d.asn} ${d.org || ''}`.trim() : 'Unknown',
            source: 'ipapi.co',
          });
        }
      }
    } catch {
      // Continue to the second HTTPS fallback.
    }

    // Second external fallback: ipwho.is. Unlike the previous ip-api.com
    // fallback, this endpoint is HTTPS and therefore safe behind Vercel/HTTPS.
    try {
      const fallbackUrl = privateIp
        ? 'https://ipwho.is/'
        : `https://ipwho.is/${encodeURIComponent(clientIp)}`;
      const res = await fetch(fallbackUrl, {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
        headers: { 'User-Agent': 'OSIRIS/4.2' },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success !== false && Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))) {
          const connection = d.connection || {};
          return json({
            status: 'success',
            query: d.ip || clientIp || 'local',
            lat: Number(d.latitude),
            lon: Number(d.longitude),
            city: d.city || 'Unknown',
            regionName: d.region || 'Unknown',
            country: d.country || d.country_code || 'Unknown',
            isp: connection.isp || connection.org || 'Unknown',
            org: connection.org || connection.isp || 'Unknown',
            as: connection.asn
              ? `AS${connection.asn} ${connection.org || ''}`.trim()
              : 'Unknown',
            source: 'ipwho.is',
          });
        }
      }
    } catch {
      // Return a graceful non-5xx response below.
    }

    // Geolocation is optional. A provider outage must not surface as a 502 in
    // the browser or interfere with the rest of OSIRIS.
    return json({
      status: 'fail',
      error: 'Geolocation temporarily unavailable',
    });
  } catch (e) {
    return json({
      status: 'fail',
      error: 'Geolocation temporarily unavailable',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
