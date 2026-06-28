import { withCache } from '@/lib/feeds/serve';

import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — Satellite Tracking API
 * Fetches TLE data from multiple sources with fallbacks
 * Computes real-time positions using simplified SGP4
 * Returns orbit ground track for trajectory visualization
 */

// ── COLOR DECONFLICTION ──
// Satellite mission colors are tuned to avoid the flight layer palette:
//   flights=#00E5FF, private=#FFD700, gov=#FF9500, military=#FF3D3D
// Also avoids maritime teal (#26C6DA), malware red (#D32F2F), news rose (#EC407A)
// Satellite palette leans toward purple/violet/blue/green spectrum

const MISSION_CLASSIFY: Record<string, { mission: string; color: string }> = {
  'USA': { mission: 'Military Recon', color: '#E040FB' },
  'NROL': { mission: 'NRO Classified', color: '#E040FB' },
  'LACROSSE': { mission: 'SAR Imaging', color: '#1DE9B6' },
  'MENTOR': { mission: 'SIGINT', color: '#F5F5F5' },
  'ORION': { mission: 'SIGINT', color: '#F5F5F5' },
  'TRUMPET': { mission: 'SIGINT', color: '#F5F5F5' },
  'GPS': { mission: 'Navigation', color: '#448AFF' },
  'NAVSTAR': { mission: 'Navigation', color: '#448AFF' },
  'GLONASS': { mission: 'Navigation', color: '#448AFF' },
  'GALILEO': { mission: 'Navigation', color: '#448AFF' },
  'BEIDOU': { mission: 'Navigation', color: '#448AFF' },
  'SBIRS': { mission: 'Early Warning', color: '#FF00FF' },
  'DSP': { mission: 'Early Warning', color: '#FF00FF' },
  'STARLINK': { mission: 'Commercial Comms', color: '#00E676' },
  'ONEWEB': { mission: 'Commercial Comms', color: '#00E676' },
  'PLANET': { mission: 'Earth Imaging', color: '#69F0AE' },
  'WORLDVIEW': { mission: 'Commercial Imaging', color: '#69F0AE' },
  'ISS': { mission: 'Space Station', color: '#FFC400' },
  'TIANGONG': { mission: 'Space Station', color: '#FFC400' },
  'COSMOS': { mission: 'Russian Military', color: '#FF5252' },
  'YAOGAN': { mission: 'Chinese Recon', color: '#FF5252' },
  'FENGYUN': { mission: 'Weather', color: '#87CEEB' },
  'GOES': { mission: 'Weather', color: '#87CEEB' },
  'NOAA': { mission: 'Weather', color: '#87CEEB' },
  'METEOSAT': { mission: 'Weather', color: '#87CEEB' },
  'LANDSAT': { mission: 'Earth Observation', color: '#81C784' },
  'SENTINEL': { mission: 'Earth Observation', color: '#81C784' },
  'TERRA': { mission: 'Earth Science', color: '#A5D6A7' },
  'AQUA': { mission: 'Earth Science', color: '#A5D6A7' },
  'HUBBLE': { mission: 'Space Telescope', color: '#FF9100' },
  'JAMES WEBB': { mission: 'Space Telescope', color: '#FF9100' },
};

function classifySatellite(name: string): { mission: string; color: string } {
  const upper = name.toUpperCase();
  for (const [keyword, info] of Object.entries(MISSION_CLASSIFY)) {
    if (upper.includes(keyword)) return info;
  }
  return { mission: 'Unknown', color: '#B388FF' };
}

function gmst(jd: number): number {
  const t = (jd - 2451545.0) / 36525.0;
  const gmstSec = 67310.54841 + (876600.0 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  return ((gmstSec % 86400) / 86400.0) * 2 * Math.PI;
}

function propagateSGP4Simple(line1: string, line2: string, timeOffsetMin: number = 0): { lat: number; lng: number; alt: number } | null {
  try {
    const incDeg = parseFloat(line2.substring(8, 16));
    const raanDeg = parseFloat(line2.substring(17, 25));
    const eccStr = '0.' + line2.substring(26, 33).trim();
    const ecc = parseFloat(eccStr);
    const argPerDeg = parseFloat(line2.substring(34, 42));
    const meanAnomDeg = parseFloat(line2.substring(43, 51));
    const meanMotion = parseFloat(line2.substring(52, 63));

    if (isNaN(meanMotion) || meanMotion === 0) return null;

    const now = new Date();
    const epochYear = parseInt(line1.substring(18, 20));
    const epochDay = parseFloat(line1.substring(20, 32));
    const fullYear = epochYear > 56 ? 1900 + epochYear : 2000 + epochYear;

    const epochDate = new Date(fullYear, 0, 1);
    epochDate.setDate(epochDate.getDate() + epochDay - 1);
    const elapsedMin = (now.getTime() - epochDate.getTime()) / 60000;

    if (Math.abs(elapsedMin) > 43200 && !line1.includes('27885-3')) return null;

    const n = meanMotion * 2 * Math.PI / 1440;
    const M = ((meanAnomDeg * Math.PI / 180) + n * (elapsedMin + timeOffsetMin)) % (2 * Math.PI);

    let E = M;
    for (let j = 0; j < 10; j++) {
      E = M + ecc * Math.sin(E);
    }

    const sinV = Math.sqrt(1 - ecc * ecc) * Math.sin(E) / (1 - ecc * Math.cos(E));
    const cosV = (Math.cos(E) - ecc) / (1 - ecc * Math.cos(E));
    const v = Math.atan2(sinV, cosV);

    const a = Math.pow(398600.4418 / (meanMotion * 2 * Math.PI / 86400) ** 2, 1 / 3);
    const r = a * (1 - ecc * Math.cos(E));

    const inc = incDeg * Math.PI / 180;
    const raan = raanDeg * Math.PI / 180;
    const argPer = argPerDeg * Math.PI / 180;
    const u = v + argPer;

    const x = r * (Math.cos(raan) * Math.cos(u) - Math.sin(raan) * Math.sin(u) * Math.cos(inc));
    const y = r * (Math.sin(raan) * Math.cos(u) + Math.cos(raan) * Math.sin(u) * Math.cos(inc));
    const z = r * Math.sin(u) * Math.sin(inc);

    const jd = 2440587.5 + now.getTime() / 86400000;
    const theta = gmst(jd);

    const xRot = x * Math.cos(theta) + y * Math.sin(theta);
    const yRot = -x * Math.sin(theta) + y * Math.cos(theta);

    const lng = Math.atan2(yRot, xRot) * 180 / Math.PI;
    const lat = Math.atan2(z, Math.sqrt(xRot * xRot + yRot * yRot)) * 180 / Math.PI;
    const alt = r - 6371;

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90) return null;
    if (alt < 100 || alt > 50000) return null;

    return {
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(((lng + 540) % 360 - 180) * 10000) / 10000,
      alt: Math.round(alt),
    };
  } catch {
    return null;
  }
}

function computeGroundTrack(line1: string, line2: string, meanMotion: number): [number, number][] | null {
  const orbitPeriod = 1440 / meanMotion;
  const steps = 48;
  const points: [number, number][] = [];
  const halfPeriod = orbitPeriod / 2;

  for (let i = 0; i < steps; i++) {
    const offset = -halfPeriod + (i / (steps - 1)) * orbitPeriod;
    const pos = propagateSGP4Simple(line1, line2, offset);
    if (pos) points.push([pos.lng, pos.lat]);
  }

  return points.length > 4 ? points : null;
}

// SatNOGS Open API - Provides full TLE JSON without API keys or IP blocks
const SATNOGS_API = 'https://db.satnogs.org/api/tle/?format=json';

let globalCachedSats: any[] = [];
let globalCacheTime = 0;

async function _GET() {
  try {
    const nowTime = Date.now();
    let allSats: any[] = globalCachedSats;
    let source = 'memory-cache';

    if (globalCachedSats.length === 0 || nowTime - globalCacheTime > 3600000) {
      try {
        const res = await stealthFetch(SATNOGS_API, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          const fetchedSats: any[] = [];
          const seen = new Set<string>();

          for (const item of data) {
            const rawName = (item.tle0 || '').trim();
            const cleanName = rawName.replace(/^0\s+/, '');
            if (cleanName && item.tle1 && item.tle2 && !seen.has(cleanName)) {
              seen.add(cleanName);
              fetchedSats.push({
                name: cleanName,
                line1: item.tle1.trim(),
                line2: item.tle2.trim(),
              });
            }
          }

          if (fetchedSats.length > 0) {
            globalCachedSats = fetchedSats;
            globalCacheTime = nowTime;
            allSats = fetchedSats;
            source = 'satnogs-api';
          }
        }
      } catch (err) {
        console.error('SatNOGS fetch error:', err);
      }
    }

    if (allSats.length === 0) {
      const issFallback = "1 25544U 98067A   24146.40251785  .00015505  00000-0  27885-3 0  9997\n2 25544  51.6402 189.7042 0004381 334.8091 106.8778 15.50091157455243";
      allSats = [{ name: 'ISS (FALLBACK)', line1: issFallback.split('\n')[0], line2: issFallback.split('\n')[1] }];
      source = 'emergency-fallback';
    }

    const sampled = allSats.length > 2000
      ? allSats.filter((_, i) => i % Math.ceil(allSats.length / 2000) === 0)
      : allSats;

    const satellites = [];
    for (const sat of sampled) {
      const pos = propagateSGP4Simple(sat.line1, sat.line2);
      if (!pos) continue;

      const meanMotion = parseFloat(sat.line2.substring(52, 63));
      const classification = classifySatellite(sat.name);

      satellites.push({
        name: sat.name,
        lat: pos.lat,
        lng: pos.lng,
        alt: pos.alt,
        mission: classification.mission,
        color: classification.color,
        noradId: sat.line1.substring(2, 7).trim(),
        groundTrack: computeGroundTrack(sat.line1, sat.line2, meanMotion),
      });
    }

    const cacheControl = satellites.length < 10
      ? 'no-store, max-age=0'
      : 'public, s-maxage=120, stale-while-revalidate=300';

    return NextResponse.json({
      satellites,
      total: satellites.length,
      source,
      raw_count: allSats.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    console.error('Satellite fetch error:', error);
    return NextResponse.json({ satellites: [], error: 'Failed to fetch satellite data' }, { status: 500 });
  }
}

export const GET = withCache('satellites', 3600000, _GET);
