import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool, ensureSchema, closePool } from './postgres';

describe('postgres client', () => {
  beforeAll(async () => { await ensureSchema(); });
  afterAll(async () => { await closePool(); });

  it('connects and reports postgis is installed', async () => {
    const { rows } = await getPool().query('SELECT extname FROM pg_extension');
    const names = rows.map(r => r.extname);
    expect(names).toContain('postgis');
  });

  it('creates the feed_items table', async () => {
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.feed_items') AS t"
    );
    expect(rows[0].t).toBe('feed_items');
  });
});
