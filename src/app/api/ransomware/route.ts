import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Ransomware.live Intelligence Feed
 *
 * Tracks active ransomware groups and recent victim disclosures.
 * Free data from ransomware.live — no auth required.
 * See https://www.ransomware.live/apidocs
 */

// ISO2 → [lng, lat] centroids for geolocating victims
const COUNTRY_MAP: Record<string, [number, number]> = {
  US:[-97,38], CA:[-96,62], MX:[-102,23.5], GB:[-2,54], DE:[10,51], FR:[2,46],
  IT:[12.5,42.8], ES:[-4,40], PT:[-8,39.5], NL:[5.5,52.5], BE:[4,50.8],
  CH:[8,47], AT:[14,47.5], DK:[10,56], SE:[16,62], NO:[8,62], FI:[26,64],
  PL:[19.5,52], CZ:[15.5,49.8], HU:[19.5,47], RO:[25,46], BG:[25.5,42.7],
  GR:[22,39], HR:[16,45.2], LT:[24,55.5], EE:[26,59], LV:[25,57],
  IE:[-8,53], IS:[-19,65], SK:[19,48.7], SI:[15,46], RS:[21,44],
  AL:[20,41], MK:[22,41.5], BA:[18,44], ME:[19,42.5],
  RU:[100,60], UA:[32,49], BY:[28,53], MD:[28,47],
  CN:[105,35], JP:[138,36], KR:[128,36], TW:[121,23.7], HK:[114.2,22.3],
  IN:[79,22], PK:[70,30], BD:[90,24], LK:[80,7], NP:[84,28],
  TH:[101,15], VN:[106,16], PH:[122,12.5], ID:[120,-5], MY:[112,3],
  SG:[103.8,1.35], MM:[96,21], KH:[105,13], LA:[102,18],
  AU:[134,-25], NZ:[174,-41],
  SA:[45,25], AE:[54,24], QA:[51,25.5], KW:[48,29.5], BH:[50.5,26],
  OM:[56,21], YE:[48,16], IQ:[44,33], IR:[53,32], IL:[34.8,31.5],
  JO:[37,31], LB:[36,34], SY:[39,35], TR:[35,39], CY:[33,35],
  AF:[65,33], UZ:[64,42], KZ:[67,48], AZ:[50,40.5], AM:[45,40],
  EG:[30,27], DZ:[3,28], MA:[-6,31], TN:[9,34], LY:[18,25],
  SD:[30,16], ET:[40,9], KE:[38,1], NG:[8,10], ZA:[24,-29],
  GH:[-2,8], CI:[-5,7], SN:[-15,14], CM:[12,6], CD:[24,-2],
  TZ:[35,-6,], UG:[32,2], RW:[30,-2], MZ:[35,-18], AO:[18.5,-12.5],
  AR:[-64,-34], CL:[-71,-30], BR:[-51,-10], CO:[-72,4], PE:[-76,-10],
  VE:[-66,7], UY:[-56,-33], PY:[-58,-23], BO:[-65,-17],
  PA:[-80,9], CR:[-84,10], NI:[-85,12.5], GT:[-90,15.5],
  CU:[-78,21], DO:[-70,19], PR:[-66.5,18],
};

interface RansomwareVictim {
  post_title: string;
  group_name: string;
  discovered: string;
  published: string;
  website?: string;
  country?: string;
  activity?: string;
  description?: string;
  extrainfos?: string;
  revenue?: string;
  employees?: string;
  country_code?: string;
}

export async function GET() {
  try {
    // Fetch victims from data.ransomware.live (range = recent ~150 victims ≈ 1MB)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://data.ransomware.live/victims.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OSIRIS/4.2',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const victims: RansomwareVictim[] = await res.json();
    const features: any[] = [];
    const groups = new Map<string, { count: number; sectors: Set<string>; countries: Set<string>; lastSeen: string }>();

    // Process and geolocate up to 500 most recent victims
    const recent = victims.slice(0, 500);

    for (const v of recent) {
      const countryCode = (v.country || v.country_code || '').toUpperCase().trim();
      const groupName = (v.group_name || 'unknown').toLowerCase().replace(/^./, c => c.toUpperCase());
      const coords = COUNTRY_MAP[countryCode];

      if (coords) {
        // Add jitter so victims in same country don't stack
        const jitterLng = ((features.length * 173.7) % 360 - 180) / 100 * 1.5;
        const jitterLat = ((features.length * 293.1) % 360 - 180) / 100 * 1.5;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [coords[0] + jitterLng, coords[1] + jitterLat],
          },
          properties: {
            id: `rv-${features.length}`,
            victim: v.post_title?.trim() || 'Unknown',
            group: groupName,
            country: countryCode,
            sector: v.activity || 'Unknown',
            discovered: v.discovered?.split('T')[0] || v.published?.split('T')[0] || '',
            description: (v.description || '').slice(0, 200),
            revenue: v.revenue,
            employees: v.employees,
          },
        });
      }

      // Aggregate group stats
      if (groupName) {
        if (!groups.has(groupName)) {
          groups.set(groupName, { count: 0, sectors: new Set(), countries: new Set(), lastSeen: '' });
        }
        const g = groups.get(groupName)!;
        g.count++;
        if (v.activity) g.sectors.add(v.activity);
        if (countryCode) g.countries.add(countryCode);
        const ds = v.discovered || v.published || '';
        if (ds > g.lastSeen) g.lastSeen = ds;
      }
    }

    return NextResponse.json({
      features,
      stats: {
        total_victims: features.length,
        active_groups: groups.size,
        groups: Array.from(groups.entries()).map(([name, info]) => ({
          name,
          victim_count: info.count,
          sectors: Array.from(info.sectors),
          countries: Array.from(info.countries),
          last_seen: info.lastSeen,
        })).sort((a, b) => b.victim_count - a.victim_count).slice(0, 50),
      },
      timestamp: new Date().toISOString(),
      source: 'ransomware.live',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] Ransomware feed error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      features: [],
      stats: { total_victims: 0, active_groups: 0, groups: [] },
      error: 'Ransomware feed unavailable',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
