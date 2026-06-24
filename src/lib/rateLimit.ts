import { getRedis } from './db/redis';

export interface LimitResult { allowed: boolean; remaining: number; }

// Plan defaults (spec): authenticated 100/min, anonymous 20/min.
export const LIMITS = { user: { max: 100, windowMs: 60_000 }, anon: { max: 20, windowMs: 60_000 } };

/**
 * Fixed-window rate limit backed by Redis INCR + PEXPIRE.
 * The first hit in a window sets the TTL; the window resets when it expires.
 * Fail-open: if Redis is unreachable, the request is allowed.
 */
export async function limit(key: string, max: number, windowMs: number): Promise<LimitResult> {
  const redis = getRedis();
  const k = `rl:${key}`;
  try {
    const count = await redis.incr(k);
    if (count === 1) await redis.pexpire(k, windowMs);
    const remaining = Math.max(0, max - count);
    return { allowed: count <= max, remaining };
  } catch {
    return { allowed: true, remaining: max };
  }
}
