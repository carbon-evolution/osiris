import { withCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Internet Outage Detection (IODA)
 * Source: Georgia Tech IODA — completely free, no auth required
 * https://api.ioda.inetintel.cc.gatech.edu/v2/
 */

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AF:[65,33],AL:[20,41],DZ:[3,28],AO:[18.5,-12.5],AR:[-64,-34],AM:[45,40],AU:[134,-25],AT:[14,47.5],AZ:[50,40.5],
  BD:[90,24],BY:[28,53],BE:[4,50.8],BR:[-51,-10],BG:[25.5,42.7],KH:[105,12.5],CM:[12,6],CA:[-96,62],CL:[-71,-30],
  CN:[105,35],CO:[-72,4],CD:[24,-3],CG:[15.8,-0.2],HR:[16,45.2],CU:[-79.5,22],CZ:[15.5,49.8],DK:[10,56],
  EC:[-78.5,-2],EG:[30,27],ET:[39.5,9],FI:[26,64],FR:[2,46],DE:[10,51],GH:[-1.5,8],GR:[22,39],
  GT:[-90.4,15.5],HN:[-86.6,14.8],HU:[19.5,47],IN:[79,22],ID:[120,-5],IR:[53,32],IQ:[44,33],IE:[-8,53],
  IL:[34.8,31.5],IT:[12.5,42.8],JP:[138,36],JO:[36.5,31],KZ:[67,48],KE:[38,1],KW:[47.5,29.5],
  LB:[35.8,33.9],LY:[17,27],LT:[24,55.5],MG:[47,-19],MY:[112,3],MX:[-102,23.5],MA:[-6,32],
  MZ:[35,-18.2],MM:[96.5,22],NP:[84,28.2],NL:[5.5,52.5],NZ:[174,-41],NG:[8,10],NO:[8,62],
  PK:[70,30],PS:[35.2,31.9],PA:[-80,9],PE:[-76,-10],PH:[122,12.5],PL:[19.5,52],PT:[-8,39.5],
  RO:[25,46],RU:[100,60],SA:[45,25],SN:[-14.5,14.5],RS:[21,44],SG:[103.8,1.35],SK:[19.5,48.7],
  ZA:[24,-29],KR:[128,36],ES:[-4,40],SD:[30,15],SE:[16,62],CH:[8,47],SY:[38,35],TW:[121,23.7],
  TZ:[35,-6],TH:[101,15],TR:[35,39],UA:[32,49],AE:[54,24],GB:[-2,54],US:[-97,38],UZ:[65,41.5],
  VE:[-66,8],VN:[106,16],YE:[48,15.5],ZM:[28,-14],ZW:[30,-20],
};

async function _GET() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 86400; // Last 24 hours
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${now}&entityType=country&limit=200`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
      headers: { 'User-Agent': 'OSIRIS/4.2', 'Accept': 'application/json' },
    });

    console.log('[OSIRIS] IODA response status:', res.status);

    if (!res.ok) {
      // Fallback: return empty but valid response
      return NextResponse.json({ outages: [], total: 0, timestamp: new Date().toISOString(), source: 'IODA (offline)' });
    }

    const json = await res.json();
    const events = json.data || [];

    const outages = events
      .filter((e: any) => {
        // IODA uses "location" field like "country/RW"
        const code = e.location?.split('/')[1];
        return code && COUNTRY_CENTROIDS[code];
      })
      .map((e: any, i: number) => {
        const code = e.location.split('/')[1];
        const [lng, lat] = COUNTRY_CENTROIDS[code];
        // Jitter so overlapping events don't stack
        const jLng = ((i * 137.5) % 200 - 100) / 100 * 2;
        const jLat = ((i * 251.3) % 200 - 100) / 100 * 2;
        return {
          id: `ioda-${code}-${i}`,
          lat: lat + jLat,
          lng: lng + jLng,
          country: code,
          code,
          score: e.score || 0,
          level: e.severity || 'unknown',
          from: e.start,
          until: e.start ? e.start + (e.duration || 0) : null,
          datasource: (e.datasource || '').replace(/_/g, ' '),
        };
      });

    return NextResponse.json({
      outages,
      total: outages.length,
      timestamp: new Date().toISOString(),
      source: 'IODA — Georgia Tech Internet Outage Detection',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] IODA fetch error:', error);
    return NextResponse.json({ outages: [], total: 0, error: 'IODA unavailable' }, { status: 500 });
  }
}

export const GET = withCache('radar', 600000, _GET);
