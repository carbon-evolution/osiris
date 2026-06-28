import { NextResponse } from 'next/server';
import { cacheFirst } from '../cacheFirst';
import type { FeedSpec } from './registry';

/**
 * Route helper: serve a feed from the local cache and attach staleness headers.
 *   X-OSIRIS-Cache:     hit | stale | miss | bypass
 *   X-OSIRIS-Age:       seconds since the served data was fetched upstream
 *   X-OSIRIS-Source-Ok: whether the last upstream refresh succeeded
 */
export async function serveFeed(spec: FeedSpec): Promise<NextResponse> {
  try {
    const r = await cacheFirst(spec.kind, spec.ttlMs, spec.fetch, { minValid: spec.minValid });
    return NextResponse.json(r.data as Record<string, unknown>, {
      headers: {
        'X-OSIRIS-Cache': r.status,
        'X-OSIRIS-Age': String(Math.round(r.ageMs / 1000)),
        'X-OSIRIS-Source-Ok': String(r.sourceOk),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(`[OSIRIS][feed] ${spec.kind} failed with no cached fallback:`, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: `Failed to fetch ${spec.kind}`, kind: spec.kind },
      { status: 502, headers: { 'X-OSIRIS-Cache': 'miss', 'X-OSIRIS-Source-Ok': 'false' } },
    );
  }
}
