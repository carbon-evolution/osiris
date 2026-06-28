import { getRedis } from './db/redis';
import { readSnapshot, writeSnapshot, markSourceDown } from './snapshotStore';

/**
 * Cache-first read engine.
 *
 * Data flow:  Resource (live API) → local cache (Redis + Postgres) → caller.
 *
 * A normal read never blocks on the upstream API:
 *   - fresh in Redis or Postgres  → serve immediately
 *   - stale but present           → serve cached now, refresh in the background
 *   - stale + refresh fails        → keep serving cached, flag source_ok=false
 *   - never cached                → one blocking fetch, store, serve
 *   - cache store unreachable      → bypass (behave like the old direct fetch)
 */

export type CacheStatus = 'hit' | 'stale' | 'miss' | 'bypass';

export interface CacheResult<T> {
  data: T;
  status: CacheStatus;
  ageMs: number;
  sourceOk: boolean;
}

export interface CacheOpts<T> {
  /** Reject a fetched payload as degraded; keeps the prior snapshot instead. */
  minValid?: (data: T) => boolean;
}

const REDIS_PREFIX = 'snap:';

interface HotEntry<T> { data: T; fetchedAt: number; sourceOk: boolean; }

async function warmRedis<T>(kind: string, entry: HotEntry<T>, ttlMs: number): Promise<void> {
  try {
    await getRedis().set(REDIS_PREFIX + kind, JSON.stringify(entry), 'PX', ttlMs);
  } catch { /* best-effort */ }
}

/** Run the upstream fetch and persist the result (used for background + scheduled refresh). */
export async function forceRefresh<T>(
  kind: string,
  fetchFn: () => Promise<T>,
  ttlMs: number,
  opts?: CacheOpts<T>,
): Promise<boolean> {
  try {
    const data = await fetchFn();
    const ok = !opts?.minValid || opts.minValid(data);
    if (!ok) {
      // Degraded payload — don't overwrite good cache; just flag the source.
      try { await markSourceDown(kind); } catch { /* ignore */ }
      return false;
    }
    await writeSnapshot(kind, data, true);
    await warmRedis(kind, { data, fetchedAt: Date.now(), sourceOk: true }, ttlMs);
    return true;
  } catch {
    try { await markSourceDown(kind); } catch { /* ignore */ }
    return false;
  }
}

export async function cacheFirst<T>(
  kind: string,
  ttlMs: number,
  fetchFn: () => Promise<T>,
  opts?: CacheOpts<T>,
): Promise<CacheResult<T>> {
  // 1. Redis hot layer
  try {
    const hot = await getRedis().get(REDIS_PREFIX + kind);
    if (hot) {
      const e = JSON.parse(hot) as HotEntry<T>;
      const age = Date.now() - e.fetchedAt;
      if (age < ttlMs) return { data: e.data, status: 'hit', ageMs: age, sourceOk: e.sourceOk };
    }
  } catch { /* redis down — fall through to Postgres */ }

  // 2. Postgres durable layer
  let snap: Awaited<ReturnType<typeof readSnapshot>> = null;
  try {
    snap = await readSnapshot(kind);
  } catch {
    // Cache store entirely unreachable → bypass, behave like the legacy direct fetch.
    const data = await fetchFn();
    return { data, status: 'bypass', ageMs: 0, sourceOk: true };
  }

  if (snap) {
    const age = Date.now() - snap.fetchedAt;
    if (age < ttlMs) {
      void warmRedis(kind, { data: snap.data as T, fetchedAt: snap.fetchedAt, sourceOk: snap.sourceOk }, ttlMs);
      return { data: snap.data as T, status: 'hit', ageMs: age, sourceOk: snap.sourceOk };
    }
    // Stale: serve now, refresh in the background (never block the caller).
    void forceRefresh(kind, fetchFn, ttlMs, opts);
    return { data: snap.data as T, status: 'stale', ageMs: age, sourceOk: snap.sourceOk };
  }

  // 3. Cold miss: one blocking fetch.
  const data = await fetchFn();
  const ok = !opts?.minValid || opts.minValid(data);
  await writeSnapshot(kind, data, ok);
  await warmRedis(kind, { data, fetchedAt: Date.now(), sourceOk: ok }, ttlMs);
  return { data, status: 'miss', ageMs: 0, sourceOk: ok };
}
