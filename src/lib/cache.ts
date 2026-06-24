import { getRedis } from './db/redis';

/**
 * Redis-backed memoization. Returns the cached value for `key` if present,
 * otherwise runs `fn`, stores its JSON for `ttlMs`, and returns it.
 * Fail-soft: if Redis is unreachable, falls back to calling `fn` directly.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    return fn();
  }
  const value = await fn();
  try {
    await redis.set(key, JSON.stringify(value), 'PX', ttlMs);
  } catch { /* cache write best-effort */ }
  return value;
}
