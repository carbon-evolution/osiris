import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { limit } from './rateLimit';
import { getRedis } from './db/redis';

describe('rateLimit', () => {
  const key = 'test:rl:anon';
  beforeAll(async () => { await getRedis().del(`rl:${key}`); });
  afterAll(async () => { await getRedis().del(`rl:${key}`); getRedis().disconnect(); });

  it('allows up to max, blocks beyond', async () => {
    const max = 20;
    let lastAllowed = true;
    for (let i = 0; i < max; i++) {
      const r = await limit(key, max, 60_000);
      lastAllowed = r.allowed;
    }
    expect(lastAllowed).toBe(true);      // 20th call still allowed
    const over = await limit(key, max, 60_000);
    expect(over.allowed).toBe(false);    // 21st blocked
    expect(over.remaining).toBe(0);
  });
});
