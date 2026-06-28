import { fetchEarthquakes } from './earthquakes';
import { fetchMarkets } from './markets';
import { fetchFlights, type FlightsPayload } from './flights';

/**
 * Cacheable feed registry. Each spec is consumed by:
 *   - the API route (read path, via cacheFirst + serveFeed)
 *   - the worker scheduler (background refresh on `cron`)
 *
 * To add a feed in later phases: extract its fetcher to src/lib/feeds/<kind>.ts
 * and add a spec here. Nothing else changes.
 */
export interface FeedSpec<T = unknown> {
  kind: string;
  ttlMs: number;            // freshness window — within this, served without an upstream call
  cron: string;             // node-cron expression for background refresh
  fetch: () => Promise<T>;
  minValid?: (data: T) => boolean; // reject degraded payloads (keep prior snapshot)
}

export const FEEDS: FeedSpec[] = [
  {
    kind: 'earthquakes',
    ttlMs: 60_000,
    cron: '*/2 * * * *',
    fetch: fetchEarthquakes,
  },
  {
    kind: 'markets',
    ttlMs: 300_000,
    cron: '*/5 * * * *',
    fetch: fetchMarkets,
  },
  {
    kind: 'flights',
    ttlMs: 45_000,
    cron: '* * * * *',
    fetch: fetchFlights,
    // OpenSky (anonymous) is rate-limited; when it fails the feed collapses to the
    // airplanes.live mil/ladd sets (~tens of flights). Treat <300 commercial as
    // degraded so we keep serving the last healthy snapshot instead.
    minValid: (d) => ((d as FlightsPayload)?.commercial_flights?.length || 0) >= 300,
  },
];

export const FEED_BY_KIND: Record<string, FeedSpec> = Object.fromEntries(
  FEEDS.map((f) => [f.kind, f]),
);
