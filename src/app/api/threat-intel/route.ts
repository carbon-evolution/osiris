import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AF:[65,33],AL:[20,41],DZ:[3,28],AO:[18.5,-12.5],AR:[-64,-34],AM:[45,40],AU:[134,-25],AT:[14,47.5],AZ:[50,40.5],
  BD:[90,24],BY:[28,53],BE:[4,50.8],BR:[-51,-10],BG:[25.5,42.7],CA:[-96,62],CL:[-71,-30],
  CN:[105,35],CO:[-72,4],HR:[16,45.2],CZ:[15.5,49.8],DK:[10,56],EG:[30,27],FI:[26,64],
  FR:[2,46],DE:[10,51],GR:[22,39],HK:[114.2,22.3],HU:[19.5,47],IN:[79,22],ID:[120,-5],
  IR:[53,32],IQ:[44,33],IE:[-8,53],IL:[34.8,31.5],IT:[12.5,42.8],JP:[138,36],KZ:[67,48],
  KE:[38,1],KR:[128,36],LT:[24,55.5],MY:[112,3],MX:[-102,23.5],NL:[5.5,52.5],NZ:[174,-41],
  NG:[8,10],NO:[8,62],PK:[70,30],PA:[-80,9],PH:[122,12.5],PL:[19.5,52],PT:[-8,39.5],
  RO:[25,46],RU:[100,60],SA:[45,25],SG:[103.8,1.35],ZA:[24,-29],ES:[-4,40],SE:[16,62],
  CH:[8,47],TW:[121,23.7],TH:[101,15],TR:[35,39],UA:[32,49],AE:[54,24],GB:[-2,54],
  US:[-97,38],VN:[106,16],
};

async function batchGeo(ips: string[]): Promise<Map<string, any>> {
  const geoMap = new Map<string, any>();
  if (ips.length === 0) return geoMap;
  try {
    const res = await fetch('http://ip-api.com/batch', {
      method: 'POST',
      body: JSON.stringify(ips),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const g of data) {
        if (g.status === 'success' && g.lat && g.lon) geoMap.set(g.query, g);
      }
    }
  } catch {}
  return geoMap;
}

async function _GET() {
  try {
    const blocklisted: any[] = [];
    let id = 0;

    // Read AbuseIPDB key from local config
    let abuseipdbKey = '';
    const abuseCachePath = '/Users/arthurlin/Downloads/Opencode/osiris/.abuseipdb_cache.json';
    const ABUSE_CACHE_TTL = 86_400_000;
    try {
      abuseipdbKey = fs.readFileSync('/Users/arthurlin/Downloads/Opencode/osiris/.abuseipdb_key', 'utf8').trim();
    } catch {}

    // 0. AbuseIPDB — known malicious IPs (requires free API key, 5 req/day free tier)
    // Disk-cache response for 24h to stay within rate limit
    if (abuseipdbKey) {
      let abuseEntries: any[] = [];
      let cacheHit = false;

      // Check disk cache
      try {
        const cached = JSON.parse(fs.readFileSync(abuseCachePath, 'utf8'));
        if (Date.now() - cached.ts < 86_400_000 && Array.isArray(cached.data)) {
          abuseEntries = cached.data;
          cacheHit = true;
          console.log('[OSIRIS] AbuseIPDB cache hit:', abuseEntries.length, 'entries');
        }
      } catch {}

      if (!cacheHit) {
        try {
          const res = await fetch(
            'https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=90&limit=10000',
            {
              headers: {
                'Key': abuseipdbKey,
                'Accept': 'application/json',
              },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (res.ok) {
            const data = await res.json();
            abuseEntries = (data.data || []).slice(0, 300);
            try { fs.writeFileSync(abuseCachePath, JSON.stringify({ ts: Date.now(), data: abuseEntries })); } catch {}
            console.log('[OSIRIS] AbuseIPDB fetched:', abuseEntries.length, 'entries');
          }
        } catch (e) { console.warn('[OSIRIS] AbuseIPDB error:', e instanceof Error ? e.message : e); }
      }

      if (abuseEntries.length > 0) {
        const ips = abuseEntries.map((e: any) => e.ipAddress).filter(Boolean);
        const geoMap = await batchGeo(ips);
        for (const entry of abuseEntries) {
          const geo = geoMap.get(entry.ipAddress);
          const cc = geo?.countryCode || entry.countryCode || 'Unknown';
          const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
          blocklisted.push({
            id: `abuse-${id++}`,
            lat: geo?.lat || centroid[1] + ((id * 43.7) % 200 - 100) / 100 * 3,
            lng: geo?.lon || centroid[0] + ((id * 137.3) % 200 - 100) / 100 * 3,
            ip: entry.ipAddress,
            port: 0,
            malware: 'AbuseIPDB',
            status: 'active',
            first_seen: '',
            last_online: entry.lastReportedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
            country: cc,
            threat_type: 'abuseipdb',
            confidence: entry.abuseConfidenceScore || 0,
            isp: entry.isp || '',
          });
        }
      }
    }

    // 1. Blocklist.de — attacking IPs (plaintext, one IP per line)
    try {
      const res = await fetch('https://lists.blocklist.de/lists/all.txt', {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const text = await res.text();
        const ips = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).slice(0, 200);
        if (ips.length > 0) {
          const geoMap = await batchGeo(ips);
          for (const ip of ips) {
            const geo = geoMap.get(ip);
            const cc = geo?.countryCode || 'Unknown';
            const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
            blocklisted.push({
              id: `bd-${id++}`,
              lat: geo?.lat || centroid[1] + ((id * 73.7) % 200 - 100) / 100 * 3,
              lng: geo?.lon || centroid[0] + ((id * 157.3) % 200 - 100) / 100 * 3,
              ip,
              port: 0,
              malware: 'Blocklist.de',
              status: 'active',
              first_seen: '',
              last_online: new Date().toISOString().split('T')[0],
              country: cc,
              threat_type: 'blocklist_de',
            });
          }
        }
      }
    } catch (e) { console.warn('[OSIRIS] Blocklist.de error:', e instanceof Error ? e.message : e); }

    // 2. SSL Blacklist (abuse.ch) — malicious SSL certificates (IP:port)
    try {
      const res = await fetch('https://sslbl.abuse.ch/blacklist/sslblacklist.csv', {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter(l => l && !l.startsWith('#')).slice(0, 100);
        const ips: string[] = [];
        for (const line of lines) {
          const cols = line.split(',');
          if (cols.length >= 2) {
            const ip = cols[0].trim().replace(/"/g, '');
            if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) ips.push(ip);
          }
        }
        const geoMap = await batchGeo(ips);
        for (const ip of ips) {
          if (blocklisted.some(t => t.ip === ip)) continue;
          const geo = geoMap.get(ip);
          const cc = geo?.countryCode || 'Unknown';
          const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
          blocklisted.push({
            id: `ssl-${id++}`,
            lat: geo?.lat || centroid[1] + ((id * 53.7) % 200 - 100) / 100 * 3,
            lng: geo?.lon || centroid[0] + ((id * 127.3) % 200 - 100) / 100 * 3,
            ip,
            port: 443,
            malware: 'SSL Blacklist',
            status: 'active',
            first_seen: '',
            last_online: new Date().toISOString().split('T')[0],
            country: cc,
            threat_type: 'ssl_blacklist',
          });
        }
      }
    } catch (e) { console.warn('[OSIRIS] SSL Blacklist error:', e instanceof Error ? e.message : e); }

    // 3. PhishTank — active phishing URLs (extract hostnames, resolve IPs)
    let phishCount = 0;
    try {
      const res = await fetch('https://data.phishtank.com/data/online-valid.csv', {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter(l => l && !l.startsWith('#')).slice(1, 51);
        const urls: string[] = [];
        for (const line of lines) {
          const cols = line.split(',');
          if (cols.length >= 5) {
            const url = cols[1]?.replace(/"/g, '');
            if (url) urls.push(url);
          }
        }
        const ips: string[] = [];
        const urlMap = new Map<string, string>();
        for (const url of urls) {
          const hostMatch = url.match(/https?:\/\/([^\/:\s]+)/);
          const ipMatch = url.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch && ipMatch[1]) {
            ips.push(ipMatch[1]);
            urlMap.set(ipMatch[1], url);
          } else if (hostMatch) {
            ips.push(hostMatch[1]);
            urlMap.set(hostMatch[1], url);
          }
        }
        const geoMap = await batchGeo(ips.filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)));
        for (const ip of ips) {
          if (blocklisted.some(t => t.ip === ip)) continue;
          if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;
          const geo = geoMap.get(ip);
          const cc = geo?.countryCode || 'Unknown';
          const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
          phishCount++;
          if (phishCount > 50) break;
          blocklisted.push({
            id: `phish-${id++}`,
            lat: geo?.lat || centroid[1] + ((id * 33.7) % 200 - 100) / 100 * 3,
            lng: geo?.lon || centroid[0] + ((id * 107.3) % 200 - 100) / 100 * 3,
            ip,
            port: 443,
            malware: 'Phishing',
            status: 'active',
            first_seen: '',
            last_online: new Date().toISOString().split('T')[0],
            country: cc,
            threat_type: 'phishing',
            url: urlMap.get(ip) || '',
          });
        }
      }
    } catch (e) { console.warn('[OSIRIS] PhishTank error:', e instanceof Error ? e.message : e); }

    return NextResponse.json({
      threats: blocklisted,
      total: blocklisted.length,
      timestamp: new Date().toISOString(),
      source: 'AbuseIPDB + Blocklist.de + SSL Blacklist + PhishTank',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] Threat intel feed error:', error);
    return NextResponse.json({ threats: [], total: 0, error: 'Threat intel unavailable' }, { status: 500 });
  }
}

export const GET = withQueryCache('threat-intel', 1800000, _GET);
