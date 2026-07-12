import { NextResponse } from 'next/server';
import WebSocket from 'ws';
import { getRedis } from '@/lib/db/redis';
import { enrichWithKpler, getKplerStatus } from '@/lib/maritime/kpler';

/**
 * OSIRIS — Maritime Intelligence
 * Real-time AIS vessel tracking via aisstream.io + Static global ports.
 */

const PORTS = [
  // ── Top Container Ports ──
  { name: 'Shanghai', country: 'CN', lat: 31.23, lng: 121.47, type: 'container', volume: '47.3M TEU', rank: 1 },
  { name: 'Singapore', country: 'SG', lat: 1.26, lng: 103.84, type: 'container', volume: '37.2M TEU', rank: 2 },
  { name: 'Ningbo-Zhoushan', country: 'CN', lat: 29.87, lng: 121.55, type: 'container', volume: '33.3M TEU', rank: 3 },
  { name: 'Shenzhen', country: 'CN', lat: 22.54, lng: 114.05, type: 'container', volume: '30.0M TEU', rank: 4 },
  { name: 'Guangzhou', country: 'CN', lat: 23.08, lng: 113.32, type: 'container', volume: '24.2M TEU', rank: 5 },
  { name: 'Busan', country: 'KR', lat: 35.10, lng: 129.04, type: 'container', volume: '22.7M TEU', rank: 6 },
  { name: 'Qingdao', country: 'CN', lat: 36.07, lng: 120.38, type: 'container', volume: '22.0M TEU', rank: 7 },
  { name: 'Rotterdam', country: 'NL', lat: 51.90, lng: 4.50, type: 'container', volume: '14.5M TEU', rank: 8 },
  { name: 'Tokyo', country: 'JP', lat: 35.61, lng: 139.79, type: 'container', volume: '4.5M TEU' },
  { name: 'Yokohama', country: 'JP', lat: 35.45, lng: 139.66, type: 'container', volume: '2.9M TEU' },
  { name: 'Kobe', country: 'JP', lat: 34.67, lng: 135.21, type: 'container', volume: '2.8M TEU' },
  { name: 'Nagoya', country: 'JP', lat: 35.08, lng: 136.87, type: 'container', volume: '2.6M TEU' },
  { name: 'Osaka', country: 'JP', lat: 34.63, lng: 135.41, type: 'container', volume: '2.1M TEU' },
  { name: 'Hakata (Fukuoka)', country: 'JP', lat: 33.60, lng: 130.40, type: 'container', volume: '0.9M TEU' },
  { name: 'Kitakyushu', country: 'JP', lat: 33.91, lng: 130.93, type: 'container', volume: '0.5M TEU' },
  { name: 'Shimizu', country: 'JP', lat: 35.00, lng: 138.50, type: 'container', volume: '0.5M TEU' },
  { name: 'Tomakomai', country: 'JP', lat: 42.63, lng: 141.63, type: 'container', volume: '0.4M TEU' },
  { name: 'Niigata', country: 'JP', lat: 37.95, lng: 139.06, type: 'container', volume: '0.2M TEU' },
  { name: 'Sendai', country: 'JP', lat: 38.27, lng: 141.02, type: 'container', volume: '0.2M TEU' },
  { name: 'Mizushima', country: 'JP', lat: 34.50, lng: 133.72, type: 'energy', volume: 'Industrial' },
  { name: 'Yokkaichi', country: 'JP', lat: 34.95, lng: 136.65, type: 'energy', volume: 'Industrial' },
  { name: 'Dubai (Jebel Ali)', country: 'AE', lat: 25.01, lng: 55.06, type: 'container', volume: '14.0M TEU', rank: 9 },
  { name: 'Port Klang', country: 'MY', lat: 2.99, lng: 101.39, type: 'container', volume: '13.2M TEU', rank: 10 },
  { name: 'Antwerp', country: 'BE', lat: 51.30, lng: 4.40, type: 'container', volume: '12.0M TEU', rank: 11 },
  { name: 'Xiamen', country: 'CN', lat: 24.48, lng: 118.09, type: 'container', volume: '11.4M TEU', rank: 12 },
  { name: 'Hamburg', country: 'DE', lat: 53.55, lng: 9.97, type: 'container', volume: '8.7M TEU', rank: 14 },
  { name: 'Los Angeles', country: 'US', lat: 33.74, lng: -118.27, type: 'container', volume: '9.9M TEU', rank: 13 },
  { name: 'Long Beach', country: 'US', lat: 33.75, lng: -118.19, type: 'container', volume: '8.0M TEU', rank: 15 },
  { name: 'Tanjung Pelepas', country: 'MY', lat: 1.36, lng: 103.55, type: 'container', volume: '9.8M TEU', rank: 16 },
  { name: 'Savannah', country: 'US', lat: 32.08, lng: -81.09, type: 'container', volume: '5.6M TEU', rank: 20 },
  { name: 'Felixstowe', country: 'GB', lat: 51.96, lng: 1.35, type: 'container', volume: '3.8M TEU', rank: 25 },
  { name: 'Santos', country: 'BR', lat: -23.95, lng: -46.31, type: 'container', volume: '4.2M TEU', rank: 22 },
  { name: 'Colombo', country: 'LK', lat: 6.94, lng: 79.84, type: 'container', volume: '7.2M TEU', rank: 17 },

  // ── Energy/Oil Ports ──
  { name: 'Ras Tanura', country: 'SA', lat: 26.64, lng: 50.16, type: 'energy', volume: '6.5M bpd' },
  { name: 'Fujairah', country: 'AE', lat: 25.14, lng: 56.35, type: 'energy', volume: '3.5M bpd' },
  { name: 'Novorossiysk', country: 'RU', lat: 44.72, lng: 37.77, type: 'energy', volume: '2.8M bpd' },
  { name: 'Houston Ship Channel', country: 'US', lat: 29.73, lng: -95.27, type: 'energy', volume: '2.5M bpd' },
  { name: 'Kharg Island', country: 'IR', lat: 29.24, lng: 50.33, type: 'energy', volume: '2.0M bpd' },
  { name: 'Primorsk', country: 'RU', lat: 60.35, lng: 28.70, type: 'energy', volume: '1.6M bpd' },

  // ── Major Naval Bases ──
  { name: 'Norfolk Naval Station', country: 'US', lat: 36.95, lng: -76.33, type: 'naval', fleet: 'US Atlantic Fleet' },
  { name: 'San Diego Naval Base', country: 'US', lat: 32.69, lng: -117.15, type: 'naval', fleet: 'US Pacific Fleet' },
  { name: 'Pearl Harbor', country: 'US', lat: 21.35, lng: -157.97, type: 'naval', fleet: 'US Pacific Fleet' },
  { name: 'Yokosuka', country: 'JP', lat: 35.28, lng: 139.67, type: 'naval', fleet: 'US 7th Fleet' },
  { name: 'Severomorsk', country: 'RU', lat: 69.07, lng: 33.42, type: 'naval', fleet: 'Russian Northern Fleet' },
  { name: 'Tartus', country: 'SY', lat: 34.89, lng: 35.89, type: 'naval', fleet: 'Russian Mediterranean' },
  { name: 'Zhanjiang', country: 'CN', lat: 21.20, lng: 110.39, type: 'naval', fleet: 'PLA Navy South Sea Fleet' },
  { name: 'Qingdao Naval', country: 'CN', lat: 36.09, lng: 120.43, type: 'naval', fleet: 'PLA Navy North Sea Fleet' },
  { name: 'Portsmouth', country: 'GB', lat: 50.80, lng: -1.11, type: 'naval', fleet: 'Royal Navy' },
  { name: 'Toulon', country: 'FR', lat: 43.12, lng: 5.93, type: 'naval', fleet: 'French Navy Mediterranean' },
  { name: 'Changi Naval Base', country: 'SG', lat: 1.33, lng: 104.01, type: 'naval', fleet: 'Republic of Singapore Navy' },
  { name: 'Visakhapatnam', country: 'IN', lat: 17.69, lng: 83.30, type: 'naval', fleet: 'Indian Navy Eastern Command' },
  { name: 'Mumbai Naval', country: 'IN', lat: 18.93, lng: 72.84, type: 'naval', fleet: 'Indian Navy Western Command' },
];

const CHOKEPOINTS = [
  { name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, traffic: '21M bpd oil', risk: 'HIGH' },
  { name: 'Strait of Malacca', lat: 2.50, lng: 101.50, traffic: '16M bpd oil', risk: 'MODERATE' },
  { name: 'Suez Canal', lat: 30.43, lng: 32.34, traffic: '12% world trade', risk: 'ELEVATED' },
  { name: 'Bab el-Mandeb', lat: 12.58, lng: 43.33, traffic: '6.2M bpd oil', risk: 'CRITICAL' },
  { name: 'Panama Canal', lat: 9.08, lng: -79.68, traffic: '5% world trade', risk: 'LOW' },
  { name: 'Turkish Straits', lat: 41.12, lng: 29.07, traffic: '3M bpd oil', risk: 'MODERATE' },
  { name: 'Danish Straits', lat: 55.70, lng: 12.60, traffic: '3.2M bpd oil', risk: 'LOW' },
  { name: 'Cape of Good Hope', lat: -34.36, lng: 18.47, traffic: 'Alt route Suez', risk: 'LOW' },
  { name: 'Taiwan Strait', lat: 24.00, lng: 119.00, traffic: '88% large ships', risk: 'ELEVATED' },
  { name: 'Lombok Strait', lat: -8.47, lng: 115.72, traffic: 'Alt Malacca', risk: 'LOW' },
];

// --- Global AIS Stream Client ---
// Hot path is an in-memory Map (the WS delivers many messages/sec); dirty ships
// are flushed to the Redis hash `osiris:ais:ships` every few seconds so positions
// survive dev-server module reloads / restarts. Fail-soft: if Redis is down the
// in-memory cache alone keeps the layer working.

const AIS_REDIS_KEY = 'osiris:ais:ships';
const AIS_FLUSH_MS = 5000;
// Retention window for a vessel after its last AIS report. aisstream.io's free
// TERRESTRIAL network floods Europe/coastal Asia/Americas but delivers almost
// nothing over the Persian Gulf, Red Sea, Indian Ocean and most of Africa
// (verified live: ~1 msg / 35 s for that whole region). A short 10-min window
// evicted those rare reports before they could accumulate, leaving the map
// blank there. A longer window lets sparse-region vessels build up locally over
// hours — the click popup shows "Received X ago" so staleness stays visible.
// (Full real-time global coverage needs SATELLITE AIS, i.e. the Kpler source.)
// Tunable via AIS_RETENTION_MS; defaults to 6 hours.
const AIS_STALE_MS = Number(process.env.AIS_RETENTION_MS) || 6 * 60 * 60 * 1000;
// Memory cap on the in-memory cache (unique vessels retained at once).
const AIS_MAX_SHIPS = Number(process.env.AIS_MAX_SHIPS) || 60000;

const globalForAis = globalThis as unknown as {
  shipsCache: Map<number, any>;
  isAisConnecting: boolean;
  aisDirty: Set<number>;
  aisFlusher: ReturnType<typeof setInterval> | null;
  aisHydrated: boolean;
};

if (!globalForAis.shipsCache) {
  globalForAis.shipsCache = new Map();
  globalForAis.isAisConnecting = false;
  globalForAis.aisDirty = new Set();
  globalForAis.aisFlusher = null;
  globalForAis.aisHydrated = false;
}

const shipsCache = globalForAis.shipsCache;

/** Load previously cached ships from Redis once per process start. */
async function hydrateFromRedis() {
  if (globalForAis.aisHydrated) return;
  globalForAis.aisHydrated = true;
  try {
    const all = await getRedis().hgetall(AIS_REDIS_KEY);
    const now = Date.now();
    for (const raw of Object.values(all)) {
      const ship = JSON.parse(raw);
      if (ship?.mmsi && now - ship.timestamp < AIS_STALE_MS && !shipsCache.has(ship.mmsi)) {
        shipsCache.set(ship.mmsi, ship);
      }
    }
  } catch { /* Redis optional */ }
}

/** Periodically persist updated ships to Redis and evict stale ones there. */
function startRedisFlusher() {
  if (globalForAis.aisFlusher) return;
  globalForAis.aisFlusher = setInterval(async () => {
    if (globalForAis.aisDirty.size === 0) return;
    const dirty = Array.from(globalForAis.aisDirty);
    globalForAis.aisDirty.clear();
    try {
      const redis = getRedis();
      const pipeline = redis.pipeline();
      const toDelete: string[] = [];
      for (const mmsi of dirty) {
        const ship = shipsCache.get(mmsi);
        if (ship) pipeline.hset(AIS_REDIS_KEY, String(mmsi), JSON.stringify(ship));
        else toDelete.push(String(mmsi));
      }
      if (toDelete.length) pipeline.hdel(AIS_REDIS_KEY, ...toDelete);
      pipeline.pexpire(AIS_REDIS_KEY, AIS_STALE_MS * 2);
      await pipeline.exec();
    } catch { /* Redis optional */ }
  }, AIS_FLUSH_MS);
}

function connectAisStream() {
  if (globalForAis.isAisConnecting) return;
  const apiKey = process.env.AIS_API_KEY;
  if (!apiKey) return;

  globalForAis.isAisConnecting = true;
  let ws: WebSocket;

  try {
    ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
  } catch (e) {
    globalForAis.isAisConnecting = false;
    return;
  }

  ws.on("open", () => {
    globalForAis.isAisConnecting = false;
    const subscriptionMessage = {
      APIKey: apiKey,
      // Target specific high-value SCM areas to ensure data delivery on free tier
      BoundingBoxes: [
        // Tokyo Bay
        [[34.8, 139.5], [35.7, 140.2]],
        // Hormuz
        [[25.0, 54.0], [27.5, 57.5]],
        // Suez Canal
        [[27.0, 32.0], [32.0, 33.5]],
        // Bab el-Mandeb
        [[12.0, 42.5], [14.0, 44.0]],
        // Panama Canal
        [[8.0, -80.5], [10.0, -79.0]],
        // Malacca / Singapore
        [[1.0, 103.0], [3.0, 104.5]],
        // Taiwan Strait
        [[22.0, 118.0], [26.0, 121.0]],
        // Rotterdam / English Channel
        [[50.0, 0.0], [53.0, 5.0]],
        // US West Coast (LA/LB)
        [[33.0, -119.0], [34.5, -117.0]],
        // Global fallback (often heavily sampled by aisstream)
        [[-90, -180], [90, 180]]
      ],
      FilterMessageTypes: ["PositionReport", "ShipStaticData"]
    };
    ws.send(JSON.stringify(subscriptionMessage));
  });

  // Map AIS ship types to OSIRIS categories. AIS has no explicit "container"
  // class (70-79 is all cargo), so large cargo vessels (length ≥ 150 m) are
  // classified as container ships — a common heuristic, not authoritative.
  const getOsirisShipType = (typeCode: number, lengthM?: number) => {
    if (!typeCode) return 'cargo';
    if (typeCode === 35) return 'military';
    if (typeCode >= 80 && typeCode <= 89) return 'tanker';
    if (typeCode >= 60 && typeCode <= 69) return 'passenger';
    if (typeCode >= 70 && typeCode <= 79) {
      return lengthM && lengthM >= 150 ? 'container' : 'cargo';
    }
    return 'other';
  };

  // AIS ETA is {Month, Day, Hour, Minute} in UTC (0 = unavailable).
  const formatEta = (eta: any) => {
    if (!eta || !eta.Month || !eta.Day) return undefined;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(eta.Month)}-${pad(eta.Day)} ${pad(eta.Hour ?? 0)}:${pad(eta.Minute ?? 0)} UTC`;
  };

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      const mmsi = parsed.MetaData?.MMSI;
      if (!mmsi) return;

      const existing = shipsCache.get(mmsi) || {
        id: mmsi, mmsi: mmsi, timestamp: Date.now()
      };

      // Extract Name from MetaData if available (present in most messages)
      if (parsed.MetaData?.ShipName) {
        existing.name = parsed.MetaData.ShipName.trim();
      }

      if (parsed.MessageType === "PositionReport" && parsed.Message?.PositionReport) {
        const report = parsed.Message.PositionReport;
        existing.lat = report.Latitude;
        existing.lng = report.Longitude;
        existing.speed = report.Sog;
        // AIS TrueHeading uses 511 as the "not available" sentinel; fall back to
        // course-over-ground for the marker rotation but keep the two distinct
        // for the popup (MarineTraffic shows COURSE and TRUE HEADING separately).
        existing.course = report.Cog;
        existing.trueHeading = report.TrueHeading === 511 ? undefined : report.TrueHeading;
        existing.heading = existing.trueHeading ?? report.Cog;
        // RateOfTurn: -128 is the AIS "not available" sentinel.
        existing.rot = report.RateOfTurn === -128 ? undefined : report.RateOfTurn;
        // NavigationalStatus is an AIS enum (0-15); mapped to text in the popup.
        existing.navStatus = report.NavigationalStatus;
        existing.source = 'Terrestrial';
        existing.timestamp = Date.now();
      }
      else if (parsed.MessageType === "ShipStaticData" && parsed.Message?.ShipStaticData) {
        const staticData = parsed.Message.ShipStaticData;
        existing.name = staticData.Name ? staticData.Name.trim() : existing.name;
        existing.destination = staticData.Destination ? staticData.Destination.trim() : existing.destination;
        existing.callsign = staticData.CallSign ? staticData.CallSign.trim() : existing.callsign;
        existing.imo = staticData.ImoNumber || existing.imo;
        // MaximumStaticDraught is in meters (0 = unavailable)
        existing.draught = staticData.MaximumStaticDraught || existing.draught;
        existing.eta = formatEta(staticData.Eta) || existing.eta;
        // Dimension A/B = distance from GPS antenna to bow/stern → vessel length
        const dim = staticData.Dimension;
        existing.length = dim && (dim.A + dim.B) > 0 ? dim.A + dim.B : existing.length;
        // Raw AIS ship-type code (0-99) → detailed label in the popup; coarse
        // `type` still drives marker colour/icon.
        existing.typeCode = staticData.Type || existing.typeCode;
        existing.type = getOsirisShipType(staticData.Type, existing.length);
      }

      // Only store if we have coordinates
      if (existing.lat && existing.lng) {
        shipsCache.set(mmsi, existing);
        globalForAis.aisDirty.add(mmsi);
      }

      // Memory guard. With the longer retention window the cache holds more
      // ships, so cap higher. When over cap, evict the STALEST vessel (not just
      // the oldest-inserted) so rare-but-recent sparse-region ships aren't the
      // first thrown away. Bounded scan over the oldest-inserted slice keeps
      // this cheap at firehose rates.
      if (shipsCache.size > AIS_MAX_SHIPS) {
        let evictKey: number | undefined;
        let oldest = Infinity;
        let scanned = 0;
        for (const [k, v] of shipsCache) {
          if (v.timestamp < oldest) { oldest = v.timestamp; evictKey = k; }
          if (++scanned >= 500) break;
        }
        if (evictKey !== undefined) {
          shipsCache.delete(evictKey);
          globalForAis.aisDirty.add(evictKey);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    globalForAis.isAisConnecting = false;
    setTimeout(connectAisStream, 5000); // Reconnect
  });

  ws.on("error", () => {
    ws.close();
  });
}

// Start connection process asynchronously
connectAisStream();
startRedisFlusher();

// --- SCM Integration: VesselAPI Hybrid Fallback (Satellite AIS) ---
async function fetchVesselApiFallback() {
  // Mock data removed per user request. We only rely on real live stream data.
}

export async function GET() {
  // Trigger Hybrid Fallback
  await fetchVesselApiFallback();

  // Recover cached positions after a restart (no-op after first call)
  await hydrateFromRedis();

  // Clean up stale ships (older than 10 minutes); marking dirty lets the
  // flusher remove them from Redis too.
  const now = Date.now();
  for (const [mmsi, ship] of shipsCache.entries()) {
    if (now - ship.timestamp > AIS_STALE_MS) {
      shipsCache.delete(mmsi);
      globalForAis.aisDirty.add(mmsi);
    }
  }

  const ships = Array.from(shipsCache.values());

  // Kpler (MarineTraffic) enrichment: adds matched/normalised destination and
  // fills nav status where AIS didn't. Fail-soft — no-ops until the Kpler
  // client-grant is provisioned (see src/lib/maritime/kpler.ts).
  let kplerStatus = getKplerStatus();
  try {
    kplerStatus = await enrichWithKpler(ships);
  } catch { /* enrichment is best-effort */ }

  // Dynamically calculate live traffic (Fast approximation of Haversine)
  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dx = (lng1 - lng2) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    const dy = lat1 - lat2;
    return Math.sqrt(dx * dx + dy * dy) * 111.32;
  };

  const dynamicPorts = PORTS.map(port => {
    let nearbyCount = 0;
    let waitingCount = 0;

    for (let i = 0; i < ships.length; i++) {
      if (getDistanceKm(port.lat, port.lng, ships[i].lat, ships[i].lng) < 50) {
        nearbyCount++;
        // If speed is less than 0.5 knots, consider it anchored/waiting
        if (ships[i].speed < 0.5 && ships[i].type !== 'military') {
          waitingCount++;
        }
      }
    }

    // Heuristic: More than 40% waiting indicates congestion
    const congestionRatio = nearbyCount > 0 ? waitingCount / nearbyCount : 0;
    let congestionStatus = 'NORMAL';
    let estDwellTime = '1-2 Days';
    
    if (congestionRatio > 0.6 || waitingCount > 30) {
      congestionStatus = 'SEVERE';
      estDwellTime = '7+ Days';
    } else if (congestionRatio > 0.4 || waitingCount > 15) {
      congestionStatus = 'CONGESTED';
      estDwellTime = '3-5 Days';
    }

    return {
      ...port,
      volume: `${port.volume} | LIVE: ${nearbyCount} (WAITING: ${waitingCount})`,
      congestion: congestionStatus,
      dwell_time: estDwellTime
    };
  });

  const dynamicChokepoints = CHOKEPOINTS.map(choke => {
    let nearbyCount = 0;
    for (let i = 0; i < ships.length; i++) {
      if (getDistanceKm(choke.lat, choke.lng, ships[i].lat, ships[i].lng) < 100) nearbyCount++;
    }
    
    // Dynamically adjust risk based on live ship concentration
    let dynamicRisk = choke.risk;
    if (nearbyCount > 50) dynamicRisk = 'CRITICAL';
    else if (nearbyCount > 20 && dynamicRisk !== 'CRITICAL') dynamicRisk = 'HIGH';
    else if (nearbyCount > 5 && dynamicRisk === 'LOW') dynamicRisk = 'ELEVATED';

    return {
      ...choke,
      traffic: `${choke.traffic} | LIVE SHIPS: ${nearbyCount}`,
      risk: dynamicRisk
    };
  });

  return NextResponse.json({
    ports: dynamicPorts,
    chokepoints: dynamicChokepoints,
    ships: ships,
    total_ports: dynamicPorts.length,
    total_chokepoints: dynamicChokepoints.length,
    total_ships: ships.length,
    kpler_status: kplerStatus,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    },
  });
}
