import { serveFeed } from '@/lib/feeds/serve';
import { FEED_BY_KIND } from '@/lib/feeds/registry';

/**
 * OSIRIS — Earthquake Data API
 * Served local-cache-first (Redis + Postgres) so page loads don't hit USGS/EMSC
 * on every request, and last-known-good seismic data renders even when upstream
 * is unavailable. Fetch logic lives in src/lib/feeds/earthquakes.ts.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return serveFeed(FEED_BY_KIND['earthquakes']);
}
