import { NextResponse } from 'next/server';
import { cacheFirst, type CacheResult, type CacheOpts } from '../cacheFirst';
import type { FeedSpec } from './registry';

/**
 * Staleness headers attached to every cache-first response:
 *   X-OSIRIS-Cache:     hit | stale | miss | bypass
 *   X-OSIRIS-Age:       seconds since the served data was fetched upstream
 *   X-OSIRIS-Source-Ok: whether the last upstream refresh succeeded
 */
function staleHeaders(r: CacheResult<unknown>): Record<string, string> {
  return {
    'X-OSIRIS-Cache': r.status,
    'X-OSIRIS-Age': String(Math.round(r.ageMs / 1000)),
    'X-OSIRIS-Source-Ok': String(r.sourceOk),
    'Cache-Control': 'no-store',
  };
}

/** Serve a registered feed (Phase 1 pilots, with their own extracted fetchers). */
export async function serveFeed(spec: FeedSpec): Promise<NextResponse> {
  try {
    const r = await cacheFirst(spec.kind, spec.ttlMs, spec.fetch, { minValid: spec.minValid });
    return NextResponse.json(r.data as Record<string, unknown>, { headers: staleHeaders(r) });
  } catch (err) {
    console.error(`[OSIRIS][feed] ${spec.kind} failed with no cached fallback:`, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: `Failed to fetch ${spec.kind}`, kind: spec.kind },
      { status: 502, headers: { 'X-OSIRIS-Cache': 'miss', 'X-OSIRIS-Source-Ok': 'false' } },
    );
  }
}

type RouteHandler = (req: Request) => Promise<Response>;

/**
 * Low-touch wrapper: cache a route's own JSON output without extracting its
 * fetch logic. Usage in a route file:
 *
 *   async function _GET(req: Request) { ...existing handler... }
 *   export const GET = withCache('news', 30 * 60_000, _GET);
 *
 * On a cache hit the inner handler is NOT called (no upstream request). On a
 * cold miss it runs once and the JSON body is stored; on stale it serves the
 * cached body and refreshes in the background; if the source is down the last
 * good body keeps serving (flagged via headers).
 */
export function withCache(
  kind: string,
  ttlMs: number,
  handler: RouteHandler,
  opts?: CacheOpts<unknown>,
): RouteHandler {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const r = await cacheFirst(kind, ttlMs, async () => {
        const res = await handler(req);
        if (!res.ok) throw new Error(`upstream returned ${res.status}`);
        const data = (await res.json()) as unknown;
        // Don't cache error payloads (some routes return {error} with HTTP 200);
        // throwing keeps the bad response out of the cache and lets the wrapper
        // fall back to the handler's native response or a still-good snapshot.
        if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
          throw new Error(String((data as Record<string, unknown>).error));
        }
        return data;
      }, opts);
      return NextResponse.json(r.data as Record<string, unknown>, { headers: staleHeaders(r) });
    } catch {
      // Cold miss AND upstream failed → fall back to the handler's native response.
      try {
        const res = await handler(req);
        return res as NextResponse;
      } catch {
        return NextResponse.json(
          { error: `Failed to fetch ${kind}`, kind },
          { status: 502, headers: { 'X-OSIRIS-Cache': 'miss', 'X-OSIRIS-Source-Ok': 'false' } },
        );
      }
    }
  };
}

/**
 * Per-query cache for on-demand lookups (OSINT, geo, dossiers). The cache key is
 * `kind?<sorted query params>`, so each distinct target (ip, domain, cve, …) gets
 * its own cached entry. A request with no query params is not cached (it's usually
 * a usage/validation error, which `res.ok === false` already routes to fallback).
 */
export function withQueryCache(
  kind: string,
  ttlMs: number,
  handler: RouteHandler,
  opts?: CacheOpts<unknown>,
): RouteHandler {
  return async (req: Request): Promise<NextResponse> => {
    const url = new URL(req.url);
    const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = entries.map(([k, v]) => `${k}=${v}`).join('&');
    const key = qs ? `${kind}?${qs}` : kind;
    try {
      const r = await cacheFirst(key, ttlMs, async () => {
        const res = await handler(req);
        if (!res.ok) throw new Error(`upstream returned ${res.status}`);
        const data = (await res.json()) as unknown;
        // Don't cache error payloads (some routes return {error} with HTTP 200);
        // throwing keeps the bad response out of the cache and lets the wrapper
        // fall back to the handler's native response or a still-good snapshot.
        if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
          throw new Error(String((data as Record<string, unknown>).error));
        }
        return data;
      }, opts);
      return NextResponse.json(r.data as Record<string, unknown>, { headers: staleHeaders(r) });
    } catch {
      try {
        const res = await handler(req);
        return res as NextResponse;
      } catch {
        return NextResponse.json(
          { error: `Failed to fetch ${kind}`, kind },
          { status: 502, headers: { 'X-OSIRIS-Cache': 'miss', 'X-OSIRIS-Source-Ok': 'false' } },
        );
      }
    }
  };
}
