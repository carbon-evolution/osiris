import { NextResponse } from 'next/server';

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

// Vendor → approximate HQ coordinates for CVE map rendering
const VENDOR_COORDS: Record<string, [number, number]> = {
  joomla: [-122.084, 37.422],     // US (California)
  wordpress: [37.620, -122.378],  // San Francisco
  apache: [37.774, -122.419],     // San Francisco
  nginx: [37.774, -122.419],      // San Francisco
  microsoft: [-122.124, 47.639],  // Redmond, WA
  google: [-122.084, 37.422],     // Mountain View, CA
  linux: [-122.331, 47.609],      // Linux Foundation (Seattle)
  oracle: [37.529, -122.263],     // Redwood City, CA
  ibm: [-73.935, 41.499],         // Armonk, NY
  adobe: [-122.332, 37.801],      // San Jose, CA
  apple: [-122.031, 37.332],      // Cupertino, CA
  cisco: [-121.928, 37.392],      // San Jose, CA
  dell: [-97.040, 29.511],        // Round Rock, TX
  vmware: [37.387, -122.058],     // Palo Alto, CA
  redhat: [-78.738, 35.817],      // Raleigh, NC
  mozilla: [-122.082, 37.387],    // Mountain View, CA
  php: [37.774, -122.419],        // San Francisco
  python: [-87.630, 41.878],      // Python Software Foundation (Chicago)
  mysql: [-122.084, 37.422],      // Mountain View, CA
  postgresql: [-122.419, 37.774], // San Francisco
  docker: [-122.419, 37.774],     // San Francisco
  kubernetes: [-122.419, 37.774], // San Francisco
  cloudflare: [37.774, -122.419], // San Francisco
  facebook: [-122.148, 37.485],   // Menlo Park, CA
  amazon: [-122.338, 47.619],     // Seattle, WA
  splunk: [37.386, -122.034],     // San Francisco
  elastic: [-122.419, 37.774],    // San Francisco
  node: [-122.419, 37.774],       // San Francisco
  dotnet: [-122.124, 47.639],     // Microsoft (Redmond)
  iis: [-122.124, 47.639],        // Microsoft (Redmond)
  'asp.net': [-122.124, 47.639],  // Microsoft (Redmond)
};

function extractVendor(text: string): string | null {
  const t = text.toLowerCase();
  for (const [vendor] of Object.entries(VENDOR_COORDS)) {
    if (t.includes(vendor)) return vendor;
  }
  return null;
}

// Convert CIDR prefix to a sample IP (first usable address in range)
function cidrToSampleIp(cidr: string): string | null {
  try {
    const [ipStr, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr);
    if (!ipStr || isNaN(bits)) return null;
    const octets = ipStr.split('.').map(Number);
    if (octets.length !== 4 || octets.some(isNaN)) return null;
    const ipNum = (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
    const mask = bits === 0 ? 0 : ~(0xFFFFFFFF >>> bits);
    const first = (ipNum & mask) + 1;
    return `${(first >>> 24) & 0xFF}.${(first >>> 16) & 0xFF}.${(first >>> 8) & 0xFF}.${first & 0xFF}`;
  } catch { return null; }
}

async function batchGeo(ips: string[]): Promise<Map<string, any>> {
  const geoMap = new Map<string, any>();
  if (ips.length === 0) return geoMap;
  try {
    const res = await fetch('http://ip-api.com/batch', {
      method: 'POST',
      body: JSON.stringify(ips),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
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

export async function GET() {
  const response: any = {
    cves: [],
    spamhaus_drop: [],
    tor_exit_nodes: [],
    mitre_enrichment: {},
    total: 0,
    timestamp: new Date().toISOString(),
  };

  // ── 1. CVE Feed via CIRCL (most recent CVEs) ──
  try {
    const res = await fetch('https://cve.circl.lu/api/last', {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      response.cves = (data || []).slice(0, 30).map((cve: any) => {
        const configTitles = (cve.vulnerable_configuration || []).slice(0, 5).map((c: any) => c.title || c.id || '');
        const vendors = configTitles.map(extractVendor).filter(Boolean) as string[];
        const uniqueVendors = [...new Set(vendors)];
        let lat = 37.774, lng = -122.419; // default: San Francisco
        if (uniqueVendors.length > 0) {
          const coords = VENDOR_COORDS[uniqueVendors[0]];
          if (coords) { lng = coords[0]; lat = coords[1]; }
        }
        return {
          id: cve.id,
          summary: cve.summary?.length > 200 ? cve.summary.slice(0, 200) + '...' : (cve.summary || ''),
          cvss: cve.cvss || 0,
          severity: !cve.cvss ? 'UNKNOWN' : cve.cvss >= 9 ? 'CRITICAL' : cve.cvss >= 7 ? 'HIGH' : cve.cvss >= 4 ? 'MEDIUM' : 'LOW',
          published: cve.Published || cve.published || '',
          vulnerable_configuration: configTitles,
          references: (cve.references || []).slice(0, 3),
          cwe: cve.capec?.length > 0 ? `CWE-${cve.capec[0].cwe_id}` : '',
          vendors: uniqueVendors,
          lat,
          lng,
        };
      });
    }
  } catch (e) { console.warn('[OSIRIS] CVE feed error:', e instanceof Error ? e.message : e); }

  // ── 2. Spamhaus DROP — CIDR hostile network blocks (BGP/routing intel) ──
  try {
    const res = await fetch('https://www.spamhaus.org/drop/drop.txt', {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').filter(l => l && !l.startsWith(';')).slice(0, 50);
      const sampleIps: string[] = [];
      const cidrMap = new Map<string, string>();
      for (const line of lines) {
        const parts = line.split(';');
        const cidr = parts[0]?.trim();
        if (!cidr) continue;
        const sampleIp = cidrToSampleIp(cidr);
        if (sampleIp) {
          sampleIps.push(sampleIp);
          cidrMap.set(sampleIp, cidr);
        }
      }
      const geoMap = await batchGeo(sampleIps);
      let id = 0;
      for (const [sampleIp, cidr] of cidrMap) {
        const geo = geoMap.get(sampleIp);
        const cc = geo?.countryCode || 'Unknown';
        const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
        response.spamhaus_drop.push({
          id: `drop-${id++}`,
          lat: geo?.lat || centroid[1] + ((id * 67.7) % 100 - 50) / 100 * 5,
          lng: geo?.lon || centroid[0] + ((id * 147.3) % 100 - 50) / 100 * 5,
          cidr,
          sample_ip: sampleIp,
          country: cc,
          source: 'Spamhaus DROP',
          threat_type: 'bgp_route',
        });
      }
    }
  } catch (e) { console.warn('[OSIRIS] Spamhaus DROP error:', e instanceof Error ? e.message : e); }

  // ── 3. Tor Exit Nodes — IPs of known Tor relays (privacy/anonymity layer) ──
  try {
    const res = await fetch('https://check.torproject.org/torbulkexitlist', {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      const ips = text.split('\n').map(l => l.trim()).filter(l => l && /^\d+\.\d+\.\d+\.\d+$/.test(l)).slice(0, 200);
      if (ips.length > 0) {
        const geoMap = await batchGeo(ips);
        let id = 0;
        for (const ip of ips) {
          const geo = geoMap.get(ip);
          const cc = geo?.countryCode || 'Unknown';
          const centroid = COUNTRY_CENTROIDS[cc] || COUNTRY_CENTROIDS.US!;
          response.tor_exit_nodes.push({
            id: `tor-${id++}`,
            lat: geo?.lat || centroid[1] + ((id * 33.7) % 200 - 100) / 100 * 3,
            lng: geo?.lon || centroid[0] + ((id * 127.3) % 200 - 100) / 100 * 3,
            ip,
            country: cc,
            source: 'Tor Project',
            threat_type: 'tor_exit',
          });
        }
      }
    }
  } catch (e) { console.warn('[OSIRIS] Tor exit node error:', e instanceof Error ? e.message : e); }

  // ── 4. MITRE ATT&CK Enrichment (technique-to-software mapping) ──
  // Simplified: common software → known ATT&CK technique IDs
  const TECHNIQUE_NAMES: Record<string, { name: string; description: string }> = {
    T1190: { name: 'Exploit Public-Facing Application', description: 'Attackers exploit public-facing application vulnerabilities to gain initial access.' },
    T1566: { name: 'Phishing', description: 'Targets are sent deceptive messages to obtain sensitive information or access.' },
    T1059: { name: 'Command and Scripting Interpreter', description: 'Adversaries abuse command interpreters to execute malicious code.' },
    T1090: { name: 'Proxy', description: 'Attackers use proxies to hide malicious traffic and obfuscate their origin.' },
    T1071: { name: 'Application Layer Protocol', description: 'Adversaries use application-layer protocols for C2 communications.' },
    T1005: { name: 'Data from Local System', description: 'Sensitive data is collected from local system sources before exfiltration.' },
    T1204: { name: 'User Execution', description: 'The attacker relies on user action to execute malicious code.' },
    T1505: { name: 'Server Software Component', description: 'Attackers install malicious components on server software for persistence.' },
    T1195: { name: 'Supply Chain Compromise', description: 'Attackers compromise third-party dependencies to infiltrate targets.' },
    T1210: { name: 'Exploitation of Remote Services', description: 'Attackers exploit network service vulnerabilities to gain unauthorized access.' },
    T1572: { name: 'Protocol Tunneling', description: 'Adversaries tunnel C2 traffic inside existing protocols to evade detection.' },
    T1475: { name: 'Deliver Malicious App via XSS', description: 'Cross-site scripting is used to deliver a malicious application to users.' },
    T1607: { name: 'XSS via SPA Routing', description: 'Single-page application routing is exploited to inject and execute scripts.' },
  };

  const buildSoftwareTechniques = (techIds: string[]) => ({
    techniques: techIds,
    names: techIds.map(t => TECHNIQUE_NAMES[t]?.name || t),
    descriptions: techIds.map(t => TECHNIQUE_NAMES[t]?.description || ''),
  });

  response.mitre_enrichment = {
    software_techniques: {
      'wordpress': buildSoftwareTechniques(['T1190', 'T1505', 'T1195']),
      'php': buildSoftwareTechniques(['T1190', 'T1505', 'T1059']),
      'apache': buildSoftwareTechniques(['T1190', 'T1005']),
      'nginx': buildSoftwareTechniques(['T1190', 'T1005']),
      'cloudflare': buildSoftwareTechniques(['T1090', 'T1572']),
      'react': buildSoftwareTechniques(['T1475', 'T1607']),
      'iis': buildSoftwareTechniques(['T1190', 'T1505', 'T1210']),
      'asp.net': buildSoftwareTechniques(['T1190', 'T1505', 'T1059']),
    },
    tactical_groups: [
      { id: 'G0016', name: 'APT29', country: 'RU', techniques: ['T1190', 'T1566', 'T1059'] },
      { id: 'G0007', name: 'APT28', country: 'RU', techniques: ['T1190', 'T1566', 'T1090'] },
      { id: 'G0080', name: 'Lazarus Group', country: 'KP', techniques: ['T1204', 'T1059', 'T1566'] },
      { id: 'G0032', name: 'Turla', country: 'RU', techniques: ['T1190', 'T1090', 'T1071'] },
      { id: 'G0045', name: 'Cozy Bear', country: 'RU', techniques: ['T1566', 'T1059', 'T1005'] },
    ],
  };

  // Map-ready arrays for CVEs and MITRE
  response.cve_nodes = response.cves.map((cve: any) => ({
    id: cve.id,
    lat: cve.lat,
    lng: cve.lng,
    title: cve.id,
    summary: cve.summary,
    cvss: cve.cvss,
    severity: cve.severity,
    vendors: cve.vendors,
    source: 'CIRCL',
    threat_type: 'cve',
  }));

  response.mitre_nodes = response.mitre_enrichment.tactical_groups.map((group: any) => {
    const centroid = COUNTRY_CENTROIDS[group.country] || COUNTRY_CENTROIDS.US!;
    return {
      id: group.id,
      lat: centroid[1],
      lng: centroid[0],
      name: group.name,
      group_id: group.id,
      country: group.country,
      techniques: group.techniques,
      technique_names: group.techniques.map((t: string) => TECHNIQUE_NAMES[t]?.name || t),
      technique_descriptions: group.techniques.map((t: string) => TECHNIQUE_NAMES[t]?.description || ''),
      source: 'MITRE ATT&CK',
      threat_type: 'mitre_apt',
    };
  });

  response.total = response.cves.length + response.spamhaus_drop.length + response.tor_exit_nodes.length;

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
