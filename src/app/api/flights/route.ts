import { serveFeed } from '@/lib/feeds/serve';
import { FEED_BY_KIND } from '@/lib/feeds/registry';

/**
 * OSIRIS — Flight Data API
 * Served local-cache-first (Redis + Postgres). Degraded snapshots (OpenSky down,
 * <300 commercial) are rejected so the last healthy snapshot keeps serving.
 * Fetch logic lives in src/lib/feeds/flights.ts.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return serveFeed(FEED_BY_KIND['flights']);
}
