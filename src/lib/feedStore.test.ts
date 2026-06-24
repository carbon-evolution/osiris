import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureSchema, getPool, closePool } from './db/postgres';
import { upsertRecords, readFresh } from './feedStore';

describe('feedStore', () => {
  beforeAll(async () => {
    await ensureSchema();
    await getPool().query("DELETE FROM feed_items WHERE kind = 'test'");
  });
  afterAll(async () => { await closePool(); });

  it('upserts and reads back records', async () => {
    await upsertRecords('test', [{ uid: 'a1', data: { v: 1 }, risk: 50 }]);
    const rows = await readFresh('test', 60_000);
    expect(rows.find(r => r.uid === 'a1')?.data).toEqual({ v: 1 });
  });

  it('treats stale rows as empty', async () => {
    const rows = await readFresh('test', 0); // 0ms TTL → everything is stale
    expect(rows.length).toBe(0);
  });
});
