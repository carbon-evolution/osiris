
import { NextResponse } from 'next/server';

/**
 * OSIRIS — Flight Data API
 * Fetches real-time aircraft positions from OpenSky (free, anonymous, fast for us)
 * and airplanes.live for military & private jet classification.
 */

/* Timeout that races against the fetch but does NOT abort the body stream.
   AbortSignal.timeout() poisons response.json() because the signal is shared.
   Promise.race gives us a connection-level timeout without locking the body. */
function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  return Promise.race([
    fetch(url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]).catch(() => null);
}

// Helicopter type codes
const HELI_TYPES = new Set([
  'R22','R44','R66','B06','B06T','B204','B205','B206','B212','B222','B230',
  'B407','B412','B427','B429','B430','B505','B525',
  'AS32','AS35','AS50','AS55','AS65',
  'EC20','EC25','EC30','EC35','EC45','EC55','EC75',
  'H125','H130','H135','H145','H155','H160','H175','H215','H225',
  'S55','S58','S61','S64','S70','S76','S92',
  'A109','A119','A139','A169','A189','AW09',
  'MD52','MD60','MDHI','MD90','NOTR',
  'B47G','HUEY','GAMA','CABR','EXE',
]);

// Private jet types
const PRIVATE_JET_TYPES = new Set([
  'G150','G200','G280','GLEX','G500','G550','G600','G650','G700',
  'GLF2','GLF3','GLF4','GLF5','GLF6','GL5T','GL7T','GV','GIV',
  'CL30','CL35','CL60','BD70','BD10',
  'C25A','C25B','C25C','C500','C510','C525','C550','C560','C56X','C680','C700','C750',
  'E35L','E50P','E55P','E545','E550',
  'FA50','FA7X','FA8X','F900','F2TH',
  'LJ35','LJ40','LJ45','LJ60','LJ70','LJ75',
  'PC12','PC24','TBM7','TBM8','TBM9',
  'PRM1','SF50','EA50','VLJ',
]);

// Military type indicators
const MILITARY_INDICATORS = new Set([
  'C17','C5M','C130','C30J','KC10','KC46','KC35','E3CF','E3TF','E8A',
  'B1B','B2','B52','F16','F15','F18','F22','F35','A10','F117',
  'RC135','E6B','P8A','P3','MQ9','RQ4','U2','EP3','RC12',
  'V22','CH47','UH60','AH64','AH1Z','MV22',
  'EUFI','RFAL','TORD','TYP','GR4',
]);

const AIRLINE_CODE_RE = /^([A-Z]{3})\d/;

function classifyFlight(f: any) {
  const modelUpper = (f.t || '').toUpperCase();
  const flightStr = (f.flight || '').trim().toUpperCase();
  const dbFlags = (f.dbFlags || 0);

  // Skip fixed structures
  if (modelUpper === 'TWR') return null;

  const lat = f.lat;
  const lon = f.lon;
  if (lat == null || lon == null) return null;

  const callsign = flightStr || f.hex || 'UNKNOWN';
  const altRaw = f.alt_baro;
  const altMeters = typeof altRaw === 'number' ? altRaw * 0.3048 : 0;
  const speedKnots = typeof f.gs === 'number' ? Math.round(f.gs * 10) / 10 : null;
  const heading = f.track || 0;
  const isHeli = HELI_TYPES.has(modelUpper) || f.category_os === 8;
  const isGrounded = typeof altRaw === 'number' && altRaw < 100;

  // OpenSky specific categorizations
  const isOsMilitary = f.category_os === 14; // UAVs often default to military in OSINT context
  const isOsJet = f.category_os === 7 || f.category_os === 3;
  const isOsPrivate = f.category_os === 2;

  // Extract airline code
  const airlineMatch = AIRLINE_CODE_RE.exec(callsign);
  const airlineCode = airlineMatch ? airlineMatch[1] : '';

  // Classification
  let category: 'commercial' | 'private' | 'jet' | 'military' = 'commercial';
  if (isOsMilitary || dbFlags & 1 || MILITARY_INDICATORS.has(modelUpper) || (f.flight || '').match(/^(RCH|KING|DUKE|EVAC|JAKE|REACH|CONVOY)\d/i)) {
    category = 'military';
  } else if (isOsJet || PRIVATE_JET_TYPES.has(modelUpper)) {
    category = 'jet';
  } else if (isOsPrivate || (!airlineCode && modelUpper && !['A319','A320','A321','A332','A333','A339','A343','A359','A388','B737','B738','B739','B38M','B39M','B752','B753','B763','B764','B772','B77L','B77W','B788','B789','B78X','E170','E175','E190','E195','CRJ7','CRJ9','AT43','AT72','DH8D'].includes(modelUpper))) {
    category = 'private';
  }

  return {
    callsign,
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lon * 100000) / 100000,
    alt: Math.round(altMeters),
    heading: Math.round(heading),
    speed_knots: speedKnots,
    model: f.t || 'Unknown',
    icao24: f.hex || '',
    registration: f.r || 'N/A',
    squawk: f.squawk || '',
    airline_code: airlineCode,
    aircraft_category: isHeli ? 'heli' : 'plane',
    category,
    grounded: isGrounded,
    nac_p: f.nac_p,
    type: 'flight',
  };
}

// In-memory cache to prevent global fan-out abuse
// NOTE (Issue #110): This cache is per-isolate in serverless environments (Vercel).
// Multiple isolates may each hold their own cache, but this is acceptable because:
// 1. It coalesces concurrent requests within the same isolate
// 2. It prevents hammering adsb.lol which would cause rate-limit bans
// For a globally shared cache, migrate to Vercel KV or similar persistent store.
let cachedData: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 45000; // 45 seconds cache window
let fetchPromise: Promise<any> | null = null;

export async function GET() {
  const now = Date.now();

  // Return cached data if within TTL
  if (cachedData && now - lastFetchTime < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  }

  // Coalesce concurrent requests: wait for the active fetch rather than starting a new one
  if (fetchPromise) {
    try {
      const data = await fetchPromise;
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    } catch {
      // Fallback to error if the pending fetch failed
      return NextResponse.json({ error: 'Failed to fetch flight data' }, { status: 500 });
    }
  }

  const JAMMING_NACAP_THRESHOLD = 4;

  // Start new global fetch
  // NOTE: We do NOT use AbortSignal.timeout() as fetch init because
  // the timeout also locks the response body stream. By the time
  // Promise.all resolves (waiting for OpenSky's ~30s response), any
  // shorter timeouts would have already fired and aborted the body
  // streams, making .json() throw "operation aborted" on all sources.
  // Instead, we fetch without per-source timeouts and rely on an
  // overall timeout via the enclosing try/catch.
  fetchPromise = (async () => {
    const [osFetch, milFetch, laddFetch] = await Promise.all([ 
      fetchWithTimeout('https://opensky-network.org/api/states/all', 45000),
      fetchWithTimeout('https://api.airplanes.live/v2/mil', 20000),
      fetchWithTimeout('https://api.airplanes.live/v2/ladd', 20000),
    ]);

    const allRaw: any[] = [];
    const seenHex = new Set<string>();

    if (osFetch?.ok) {
      try {
        const data = await osFetch.json();
        for (const s of (data.states || [])) {
          const hex = (s[0] || '').toLowerCase().trim();
          if (hex && !seenHex.has(hex)) {
            seenHex.add(hex);
            allRaw.push({
              hex: s[0],
              flight: s[1]?.trim(),
              lon: s[5],
              lat: s[6],
              alt_baro: typeof s[7] === 'number' ? s[7] * 3.28084 : null,
              gs: typeof s[9] === 'number' ? s[9] * 1.94384 : null,
              track: s[10],
              squawk: s[14],
              category_os: s[17],
            });
          }
        }
      } catch(e) {}
    }

    if (milFetch?.ok) {
      try {
        const data = await milFetch.json();
        for (const ac of (data.ac || [])) {
          const hex = (ac.hex || '').toLowerCase().trim();
          if (hex && !seenHex.has(hex)) {
            seenHex.add(hex);
            allRaw.push(ac);
          }
        }
      } catch(e) {}
    }

    if (laddFetch?.ok) {
      try {
        const data = await laddFetch.json();
        for (const ac of (data.ac || [])) {
          const hex = (ac.hex || '').toLowerCase().trim();
          if (hex && !seenHex.has(hex)) {
            seenHex.add(hex);
            allRaw.push(ac);
          }
        }
      } catch(e) {}
    }



    // Classify all flights
    const commercial: any[] = [];
    const privateFl: any[] = [];
    const jets: any[] = [];
    const military: any[] = [];
    const gpsJamming: any[] = [];

    for (const raw of allRaw) {
      const flight = classifyFlight(raw);
      if (!flight) continue;

      // GPS jamming detection
      if (typeof flight.nac_p === 'number' && flight.nac_p <= JAMMING_NACAP_THRESHOLD && !flight.grounded) {
        gpsJamming.push({
          lat: flight.lat,
          lng: flight.lng,
          nac_p: flight.nac_p,
          callsign: flight.callsign,
        });
      }

      switch (flight.category) {
        case 'military': military.push(flight); break;
        case 'jet': jets.push(flight); break;
        case 'private': privateFl.push(flight); break;
        default: commercial.push(flight);
      }
    }

    // Aggregate GPS jamming zones (grid-based)
    const jammingZones = aggregateJamming(gpsJamming, JAMMING_NACAP_THRESHOLD);

    return {
      commercial_flights: commercial,
      private_flights: privateFl,
      private_jets: jets,
      military_flights: military,
      gps_jamming: jammingZones,
      total: allRaw.length,
      timestamp: new Date().toISOString(),
    };
  })();

  try {
    const data = await fetchPromise;
    fetchPromise = null;

    // OpenSky (anonymous) is rate-limited; when it fails, the result collapses
    // to just the airplanes.live mil/ladd feeds (~tens of flights). Don't let
    // that degraded snapshot overwrite a healthy cache — keep serving the last
    // good data so the map doesn't suddenly drop to ~140 flights.
    const newCom = data.commercial_flights?.length || 0;
    const prevCom = cachedData?.commercial_flights?.length || 0;
    if (newCom < 300 && prevCom > newCom) {
      lastFetchTime = Date.now(); // serve cached for the TTL window, then retry
      return NextResponse.json(cachedData, {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
      });
    }

    cachedData = data;
    lastFetchTime = Date.now();

    const cacheControl = data.total < 100
      ? 'no-store, max-age=0'
      : 'public, s-maxage=30, stale-while-revalidate=60';

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    console.error('Flight fetch error:', error);
    fetchPromise = null;
    return NextResponse.json(
      { error: 'Failed to fetch flight data' },
      { status: 500 }
    );
  }
}

function aggregateJamming(points: any[], threshold: number) {
  if (points.length === 0) return [];
  const grid = new Map<string, { lat: number; lng: number; count: number; total_nac_p: number }>();
  const GRID_SIZE = 2; // degrees

  for (const p of points) {
    const gLat = Math.floor(p.lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(p.lng / GRID_SIZE) * GRID_SIZE;
    const key = `${gLat},${gLng}`;

    if (!grid.has(key)) {
      grid.set(key, { lat: gLat + GRID_SIZE / 2, lng: gLng + GRID_SIZE / 2, count: 0, total_nac_p: 0 });
    }
    const cell = grid.get(key)!;
    cell.count++;
    cell.total_nac_p += p.nac_p;
  }

  return Array.from(grid.values())
    .filter(z => z.count >= 3) // Minimum 3 aircraft with degraded NACp
    .map(z => ({
      lat: z.lat,
      lng: z.lng,
      severity: Math.round((1 - (z.total_nac_p / z.count) / threshold) * 100),
      count: z.count,
    }));
}

