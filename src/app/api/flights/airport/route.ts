import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Airport Flight Board API
 *
 * Fetches live flight data from OpenSky and filters flights near a given
 * airport, classifying them as arrivals (heading toward airport, descending)
 * vs departures (near airport, ascending).
 *
 * Accepts an ICAO airport code (e.g. "EHAM" for Schiphol) or explicit
 * lat/lon coordinates. Returns a structured flight board with separate
 * arrivals and departures lists, plus GeoJSON features for map rendering.
 *
 * Cache: 60s TTL since airport boards are consumed interactively.
 */

// ── Compact airport database: top ~70 busiest international airports ──
const AIRPORT_DB: Record<string, { icao: string; iata: string; name: string; city: string; country: string; lat: number; lon: number }> = {
  // North America
  'KATL': { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson Atlanta', city: 'Atlanta', country: 'US', lat: 33.6407, lon: -84.4277 },
  'KORD': { icao: 'KORD', iata: 'ORD', name: "O'Hare International", city: 'Chicago', country: 'US', lat: 41.9742, lon: -87.9073 },
  'KDFW': { icao: 'KDFW', iata: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', country: 'US', lat: 32.8998, lon: -97.0403 },
  'KDEN': { icao: 'KDEN', iata: 'DEN', name: 'Denver International', city: 'Denver', country: 'US', lat: 39.8561, lon: -104.6737 },
  'KLAX': { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US', lat: 33.9416, lon: -118.4085 },
  'KJFK': { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'US', lat: 40.6413, lon: -73.7781 },
  'KSFO': { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'US', lat: 37.6213, lon: -122.379 },
  'KSEA': { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle', country: 'US', lat: 47.4502, lon: -122.3088 },
  'KLAS': { icao: 'KLAS', iata: 'LAS', name: 'Harry Reid International', city: 'Las Vegas', country: 'US', lat: 36.084, lon: -115.1537 },
  'KMIA': { icao: 'KMIA', iata: 'MIA', name: 'Miami International', city: 'Miami', country: 'US', lat: 25.7932, lon: -80.2906 },
  'CYYZ': { icao: 'CYYZ', iata: 'YYZ', name: 'Toronto Pearson', city: 'Toronto', country: 'CA', lat: 43.6772, lon: -79.6306 },
  'MMMX': { icao: 'MMMX', iata: 'MEX', name: 'Mexico City International', city: 'Mexico City', country: 'MX', lat: 19.4363, lon: -99.0721 },

  // Europe
  'EGLL': { icao: 'EGLL', iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.4700, lon: -0.4543 },
  'EGKK': { icao: 'EGKK', iata: 'LGW', name: 'Gatwick', city: 'London', country: 'GB', lat: 51.1481, lon: -0.1903 },
  'EHAM': { icao: 'EHAM', iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'NL', lat: 52.3086, lon: 4.7639 },
  'LFPG': { icao: 'LFPG', iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR', lat: 49.0097, lon: 2.5478 },
  'EDDF': { icao: 'EDDF', iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE', lat: 50.0379, lon: 8.5622 },
  'LEMD': { icao: 'LEMD', iata: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'ES', lat: 40.4936, lon: -3.5668 },
  'LEBL': { icao: 'LEBL', iata: 'BCN', name: 'Barcelona–El Prat', city: 'Barcelona', country: 'ES', lat: 41.2971, lon: 2.0785 },
  'LIRF': { icao: 'LIRF', iata: 'FCO', name: 'Leonardo da Vinci–Fiumicino', city: 'Rome', country: 'IT', lat: 41.8045, lon: 12.2508 },
  'LSZH': { icao: 'LSZH', iata: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'CH', lat: 47.4586, lon: 8.5481 },
  'LOWW': { icao: 'LOWW', iata: 'VIE', name: 'Vienna International', city: 'Vienna', country: 'AT', lat: 48.1105, lon: 16.5697 },
  'EKCH': { icao: 'EKCH', iata: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'DK', lat: 55.6180, lon: 12.6561 },
  'ESSA': { icao: 'ESSA', iata: 'ARN', name: 'Stockholm Arlanda', city: 'Stockholm', country: 'SE', lat: 59.6498, lon: 17.9295 },
  'EFHK': { icao: 'EFHK', iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'FI', lat: 60.3172, lon: 24.9633 },
  'UUDD': { icao: 'UUDD', iata: 'DME', name: 'Domodedovo International', city: 'Moscow', country: 'RU', lat: 55.4102, lon: 37.9023 },
  'ULLI': { icao: 'ULLI', iata: 'LED', name: 'Pulkovo Airport', city: 'Saint Petersburg', country: 'RU', lat: 59.8003, lon: 30.2625 },

  // Middle East
  'OMDB': { icao: 'OMDB', iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'AE', lat: 25.2532, lon: 55.3657 },
  'OTHH': { icao: 'OTHH', iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'QA', lat: 25.2842, lon: 51.5212 },
  'OEJN': { icao: 'OEJN', iata: 'JED', name: 'King Abdulaziz International', city: 'Jeddah', country: 'SA', lat: 21.6796, lon: 39.1565 },
  'LLBG': { icao: 'LLBG', iata: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'IL', lat: 32.0055, lon: 34.8854 },
  'LTFM': { icao: 'LTFM', iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'TR', lat: 41.2613, lon: 28.7420 },

  // Asia
  'RJTT': { icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', country: 'JP', lat: 35.5494, lon: 139.7798 },
  'RJAA': { icao: 'RJAA', iata: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'JP', lat: 35.7647, lon: 140.3864 },
  'RKSI': { icao: 'RKSI', iata: 'ICN', name: 'Incheon International', city: 'Seoul', country: 'KR', lat: 37.4692, lon: 126.4506 },
  'ZSPD': { icao: 'ZSPD', iata: 'PVG', name: 'Shanghai Pudong', city: 'Shanghai', country: 'CN', lat: 31.1443, lon: 121.8083 },
  'ZGSZ': { icao: 'ZGSZ', iata: 'SZX', name: 'Shenzhen Bao\'an', city: 'Shenzhen', country: 'CN', lat: 22.6445, lon: 113.8132 },
  'ZHCC': { icao: 'ZHCC', iata: 'CGO', name: 'Zhengzhou Xinzheng', city: 'Zhengzhou', country: 'CN', lat: 34.5278, lon: 113.8412 },
  'VHHH': { icao: 'VHHH', iata: 'HKG', name: 'Hong Kong International', city: 'Hong Kong', country: 'HK', lat: 22.3080, lon: 113.9185 },
  'RCSS': { icao: 'RCSS', iata: 'TSA', name: 'Taipei Songshan', city: 'Taipei', country: 'TW', lat: 25.0697, lon: 121.5523 },
  'RCTP': { icao: 'RCTP', iata: 'TPE', name: 'Taiwan Taoyuan International', city: 'Taipei', country: 'TW', lat: 25.0808, lon: 121.2330 },
  'WSSS': { icao: 'WSSS', iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'SG', lat: 1.3592, lon: 103.9894 },
  'VTBS': { icao: 'VTBS', iata: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'TH', lat: 13.6900, lon: 100.7501 },
  'WMKK': { icao: 'WMKK', iata: 'KUL', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', country: 'MY', lat: 2.7433, lon: 101.6984 },
  'VOBL': { icao: 'VOBL', iata: 'BLR', name: 'Kempegowda International', city: 'Bangalore', country: 'IN', lat: 13.1979, lon: 77.7063 },
  'VIDP': { icao: 'VIDP', iata: 'DEL', name: 'Indira Gandhi International', city: 'Delhi', country: 'IN', lat: 28.5562, lon: 77.1000 },
  'VABB': { icao: 'VABB', iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj', city: 'Mumbai', country: 'IN', lat: 19.0887, lon: 72.8679 },
  'RPLL': { icao: 'RPLL', iata: 'MNL', name: 'Ninoy Aquino International', city: 'Manila', country: 'PH', lat: 14.5086, lon: 121.0196 },

  // Oceania
  'YSSY': { icao: 'YSSY', iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'AU', lat: -33.9399, lon: 151.1753 },
  'YMML': { icao: 'YMML', iata: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'AU', lat: -37.6733, lon: 144.8433 },
  'NZAA': { icao: 'NZAA', iata: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'NZ', lat: -37.0081, lon: 174.7915 },

  // Africa
  'FAOR': { icao: 'FAOR', iata: 'JNB', name: 'O.R. Tambo International', city: 'Johannesburg', country: 'ZA', lat: -26.1338, lon: 28.2423 },
  'HECA': { icao: 'HECA', iata: 'CAI', name: 'Cairo International', city: 'Cairo', country: 'EG', lat: 30.1202, lon: 31.4075 },
  'DNMM': { icao: 'DNMM', iata: 'LOS', name: 'Murtala Muhammed International', city: 'Lagos', country: 'NG', lat: 6.5774, lon: 3.3210 },
  'FIMP': { icao: 'FIMP', iata: 'MRU', name: 'Sir Seewoosagur Ramgoolam', city: 'Port Louis', country: 'MU', lat: -20.4302, lon: 57.6836 },

  // South America
  'SBGR': { icao: 'SBGR', iata: 'GRU', name: 'São Paulo–Guarulhos', city: 'São Paulo', country: 'BR', lat: -23.4356, lon: -46.4731 },
  'SBGL': { icao: 'SBGL', iata: 'GIG', name: 'Rio de Janeiro–Galeão', city: 'Rio de Janeiro', country: 'BR', lat: -22.8090, lon: -43.2506 },
  'SAEZ': { icao: 'SAEZ', iata: 'EZE', name: 'Ministro Pistarini', city: 'Buenos Aires', country: 'AR', lat: -34.8222, lon: -58.5358 },
  'SCEL': { icao: 'SCEL', iata: 'SCL', name: 'Santiago International', city: 'Santiago', country: 'CL', lat: -33.3930, lon: -70.7853 },
};

// Cache for the OpenSky states fetch (re-used across board requests)
const statesCache: { ts: number; states: any[] } = { ts: 0, states: [] };
const STATES_CACHE_TTL = 30000; // 30 seconds

async function getLiveStates(): Promise<any[]> {
  const now = Date.now();
  if (statesCache.states.length > 0 && now - statesCache.ts < STATES_CACHE_TTL) {
    return statesCache.states;
  }
  try {
    const res = await stealthFetch('https://opensky-network.org/api/states/all', {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      statesCache.states = data.states || [];
      statesCache.ts = Date.now();
      return statesCache.states;
    }
  } catch (e) {
    console.warn('[AIRPORT BOARD] OpenSky fetch error:', e instanceof Error ? e.message : e);
  }
  return statesCache.states;
}

/** Haversine distance in km between two lat/lon points */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao = (searchParams.get('icao') || '').toUpperCase().trim();
  const latParam = searchParams.get('lat');
  const lonParam = searchParams.get('lon');
  const radiusParam = searchParams.get('radius');
  const typeFilter = (searchParams.get('type') || 'all').toLowerCase().trim();

  // Resolve airport
  let airport: typeof AIRPORT_DB[string] | null = null;
  if (icao && AIRPORT_DB[icao]) {
    airport = AIRPORT_DB[icao];
  } else if (latParam && lonParam) {
    airport = {
      icao: icao || 'CUSTOM',
      iata: '',
      name: icao || 'Custom Location',
      city: '',
      country: '',
      lat: parseFloat(latParam),
      lon: parseFloat(lonParam),
    };
  } else if (icao) {
    return NextResponse.json(
      { error: `Airport '${icao}' not found in database. Provide lat/lon params.` },
      { status: 404 },
    );
  } else {
    return NextResponse.json(
      { error: 'Requires icao parameter or lat+lon parameters' },
      { status: 400 },
    );
  }

  if (isNaN(airport.lat) || isNaN(airport.lon)) {
    return NextResponse.json({ error: 'Invalid airport coordinates' }, { status: 400 });
  }

  const radiusKm = radiusParam ? parseFloat(radiusParam) : 80;
  const airportLat = airport.lat;
  const airportLon = airport.lon;

  // Fetch live states
  const states = await getLiveStates();

  // Filter flights near the airport and classify
  const arrivals: any[] = [];
  const departures: any[] = [];
  const nearAirport: any[] = [];

  for (const s of states) {
    const hex: string = (s[0] || '').toLowerCase();
    const callsign: string = (s[1] || '').trim();
    const lon: number = s[5];
    const lat: number = s[6];
    const altBaro: number = s[7]; // meters
    const velocity: number = s[9]; // m/s
    const track: number = s[10];
    const vertRate: number = s[11]; // m/s
    const onGround: boolean = s[8] === true;

    if (lat == null || lon == null) continue;
    if (!callsign) continue;

    const dist = haversineKm(airportLat, airportLon, lat, lon);
    if (dist > radiusKm) continue;

    // Altitude in feet
    const altFeet = typeof altBaro === 'number' ? Math.round(altBaro * 3.28084) : 0;
    const speedKnots = typeof velocity === 'number' ? Math.round(velocity * 1.94384) : 0;

    const entry = {
      icao24: hex,
      callsign,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      alt_ft: altFeet,
      speed_knots: speedKnots,
      heading: typeof track === 'number' ? Math.round(track) : 0,
      vert_rate_fpm: typeof vertRate === 'number' ? Math.round(vertRate * 196.85) : 0,
      distance_km: Math.round(dist * 10) / 10,
      on_ground: onGround,
    };

    nearAirport.push(entry);

    // Classify: arrivals are descending or low altitude heading toward runway
    // Departures are ascending or just took off
    if (onGround) {
      // On the ground - could be either, skip or mark as "parked"
      continue;
    }

    const isDescending = typeof vertRate === 'number' && vertRate < -2;
    const isAscending = typeof vertRate === 'number' && vertRate > 2;
    const isLow = altFeet < 5000;

    if (isDescending && dist < 60) {
      arrivals.push(entry);
    } else if (isAscending && dist < 60) {
      departures.push(entry);
    } else if (dist < 15 && isLow) {
      // Very close and low: arriving
      arrivals.push(entry);
    } else if (dist < 15 && !isDescending) {
      departures.push(entry);
    }
  }

  // Sort arrivals by distance (closest first)
  arrivals.sort((a, b) => a.distance_km - b.distance_km);
  // Sort departures by altitude (lowest first = just took off)
  departures.sort((a, b) => a.alt_ft - b.alt_ft);

  // Build result
  const result: any = {
    airport: {
      icao: airport.icao,
      iata: airport.iata,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      lat: airportLat,
      lon: airportLon,
    },
    radius_km: radiusKm,
    timestamp: new Date().toISOString(),
    stats: {
      total_nearby: nearAirport.length,
      arrivals: arrivals.length,
      departures: departures.length,
    },
    arrivals: typeFilter === 'all' || typeFilter === 'arrivals' ? arrivals.slice(0, 50) : [],
    departures: typeFilter === 'all' || typeFilter === 'departures' ? departures.slice(0, 50) : [],
    nearby: nearAirport.slice(0, 100),
  };

  // Add GeoJSON for map rendering
  result.geojson = {
    type: 'FeatureCollection',
    features: [
      // Airport location
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [airportLon, airportLat] },
        properties: { type: 'airport', icao: airport.icao, name: airport.name },
      },
      // Arrival markers
      ...result.arrivals.map((f: any) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: { ...f, board_type: 'arrival' },
      })),
      // Departure markers
      ...result.departures.map((f: any) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: { ...f, board_type: 'departure' },
      })),
    ],
  };

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
