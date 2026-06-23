import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Flight Enrichment API
 *
 * Proxies adsbdb.com (free, no-key) to enrich a flight click with:
 *   - Airline name + country of registration
 *   - Origin airport (name, code, municipality, country, lat/lng)
 *   - Destination airport (name, code, municipality, country, lat/lng)
 *   - Aircraft details (type, manufacturer, registered owner, photo)
 *
 * Caches per callsign for 15 minutes — flight routes don't change mid-journey.
 */

const ADSBDB_BASE = 'https://api.adsbdb.com/v0';

// In-memory cache keyed by callsign, TTL = 15 min
const cache = new Map<string, { ts: number; data: any }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { ts: Date.now(), data });
  // Evict oldest entries if cache > 500
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const callsignRaw = (searchParams.get('callsign') || '').toUpperCase().trim();
  const icao24 = (searchParams.get('icao24') || '').toLowerCase().trim();

  if (!callsignRaw && !icao24) {
    return NextResponse.json(
      { error: 'Requires callsign or icao24 parameter' },
      { status: 400 },
    );
  }

  const result: any = {};

  // ── 1. Route + Airline lookup by callsign ──
  if (callsignRaw) {
    // Strip leading numeric noise and trailing operators like /AAL → strip everything after /
    const cleanCs = callsignRaw.replace(/\/.*$/, '');
    if (cleanCs.length >= 3) {
      const cached = getCached(cleanCs);
      if (cached) {
        result.route = cached;
      } else {
        try {
          const res = await stealthFetch(`${ADSBDB_BASE}/callsign/${cleanCs}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const body = await res.json();
            const fr = body?.response?.flightroute;
            if (fr) {
              result.route = {
                callsign: fr.callsign || cleanCs,
                callsign_icao: fr.callsign_icao,
                callsign_iata: fr.callsign_iata,
                airline: fr.airline
                  ? {
                      name: fr.airline.name,
                      icao: fr.airline.icao,
                      iata: fr.airline.iata,
                      country: fr.airline.country,
                      country_iso: fr.airline.country_iso,
                    }
                  : null,
                origin: fr.origin
                  ? {
                      name: fr.origin.name,
                      iata: fr.origin.iata_code,
                      icao: fr.origin.icao_code,
                      municipality: fr.origin.municipality,
                      country: fr.origin.country_name,
                      country_iso: fr.origin.country_iso_name,
                      lat: fr.origin.latitude,
                      lng: fr.origin.longitude,
                    }
                  : null,
                destination: fr.destination
                  ? {
                      name: fr.destination.name,
                      iata: fr.destination.iata_code,
                      icao: fr.destination.icao_code,
                      municipality: fr.destination.municipality,
                      country: fr.destination.country_name,
                      country_iso: fr.destination.country_iso_name,
                      lat: fr.destination.latitude,
                      lng: fr.destination.longitude,
                    }
                  : null,
              };
              setCache(cleanCs, result.route);
            }
          }
        } catch (e) {
          console.warn('[ENRICH] adsbdb callsign lookup error:', e instanceof Error ? e.message : e);
        }
      }
    }
  }

  // ── 2. Aircraft details by ICAO24 hex ──
  if (icao24 && icao24.length >= 6) {
    try {
      const res = await stealthFetch(`${ADSBDB_BASE}/aircraft/${icao24}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const body = await res.json();
        const ac = body?.response?.aircraft;
        if (ac) {
          result.aircraft = {
            type: ac.type,
            icao_type: ac.icao_type,
            manufacturer: ac.manufacturer,
            registration: ac.registration,
            owner_country: ac.registered_owner_country_name,
            owner_country_iso: ac.registered_owner_country_iso_name,
            operator: ac.registered_owner_operator_flag_code,
            owner: ac.registered_owner,
            photo: ac.url_photo_thumbnail,
            photo_full: ac.url_photo,
          };
        }
      }
    } catch (e) {
      console.warn('[ENRICH] adsbdb aircraft lookup error:', e instanceof Error ? e.message : e);
    }
  }

  if (!result.route && !result.aircraft) {
    return NextResponse.json({ error: 'No enrichment data found', data: null }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
    },
  });
}
