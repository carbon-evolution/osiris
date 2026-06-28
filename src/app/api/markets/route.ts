import { serveFeed } from '@/lib/feeds/serve';
import { FEED_BY_KIND } from '@/lib/feeds/registry';

/**
 * OSIRIS — Financial Markets & Commodities API
 * Served local-cache-first (Redis + Postgres) to protect free-tier quota on
 * Yahoo Finance / CoinGecko. Fetch logic lives in src/lib/feeds/markets.ts.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return serveFeed(FEED_BY_KIND['markets']);
}
