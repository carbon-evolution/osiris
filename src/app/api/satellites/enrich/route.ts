import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — Satellite Enrichment API
 *
 * Proxies SatNOGS DB (free, no-key) to enrich a satellite click with:
 *   - Satellite metadata: country, status, operator, launch date, image
 *   - Transmitter details: frequencies, modulation, baud rate, type, description
 *
 * Caches per NORAD ID for 60 minutes — satellite metadata changes rarely.
 */

const SATNOGS_BASE = 'https://db.satnogs.org/api';

// In-memory cache keyed by noradId, TTL = 60 min
const cache = new Map<string, { ts: number; data: any }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { ts: Date.now(), data });
  // Evict oldest entries if cache > 200
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noradId = searchParams.get('noradId') || '';
  const noradIdClean = noradId.trim();

  if (!noradIdClean || !/^\d{1,8}$/.test(noradIdClean)) {
    return NextResponse.json(
      { error: 'Requires numeric noradId parameter' },
      { status: 400 },
    );
  }

  const result: any = { noradId: noradIdClean };

  // ── 1. Check cache ──
  const cached = getCached(noradIdClean);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  }

  // ── 2. Satellite metadata from SatNOGS satellites API ──
  try {
    const res = await stealthFetch(
      `${SATNOGS_BASE}/satellites/?format=json&norad_cat_id=${noradIdClean}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body) && body.length > 0) {
        const sat = body[0];
        result.satellite = {
          sat_id: sat.sat_id,
          name: sat.name,
          names: sat.names || null,
          status: sat.status || null,
          decayed: sat.decayed || null,
          countries: sat.countries || null,
          operator: sat.operator || null,
          website: sat.website || null,
          image: sat.image
            ? `https://db.satnogs.org/media/${sat.image}`
            : null,
          launched: sat.launched || null,
          citation: sat.citation || null,
          telemetries: sat.telemetries || [],
        };
      }
    }
  } catch (e) {
    console.warn(
      '[SAT-ENRICH] satellite metadata error:',
      e instanceof Error ? e.message : e,
    );
  }

  // ── 3. Transmitters from SatNOGS transmitters API ──
  try {
    const res = await stealthFetch(
      `${SATNOGS_BASE}/transmitters/?format=json&norad_cat_id=${noradIdClean}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body)) {
        result.transmitters = body.map((tx: any) => ({
          uuid: tx.uuid,
          description: tx.description || null,
          alive: tx.alive ?? null,
          type: tx.type || null,
          mode: tx.mode || null,
          uplink_low: tx.uplink_low || null,
          downlink_low: tx.downlink_low || null,
          baud: tx.baud ?? null,
          status: tx.status || null,
          service: tx.service || null,
        }));
      }
    }
  } catch (e) {
    console.warn(
      '[SAT-ENRICH] transmitters error:',
      e instanceof Error ? e.message : e,
    );
  }

  if (!result.satellite && (!result.transmitters || result.transmitters.length === 0)) {
    return NextResponse.json(
      { error: 'No enrichment data found for this NORAD ID', noradId: noradIdClean },
      { status: 404 },
    );
  }

  // Cache before returning
  setCache(noradIdClean, result);

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}
