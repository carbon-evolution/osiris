import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cached } from './cache';
import { getRedis } from './db/redis';

describe('cache', () => {
  beforeAll(async () => { await getRedis().del('test:cache:k'); });
  afterAll(async () => { await getRedis().del('test:cache:k'); getRedis().disconnect(); });

  it('memoizes: fn runs once within TTL', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { n: 42 }; };
    const a = await cached('test:cache:k', 5000, fn);
    const b = await cached('test:cache:k', 5000, fn);
    expect(a).toEqual({ n: 42 });
    expect(b).toEqual({ n: 42 });
    expect(calls).toBe(1); // second call served from redis
  });
});
