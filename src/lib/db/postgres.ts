import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST ?? 'localhost',
      port: Number(process.env.PG_PORT ?? 5432),
      user: process.env.PG_USER ?? 'osiris',
      password: process.env.PG_PASSWORD ?? 'osiris',
      database: process.env.PG_DB ?? 'osiris',
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

// Generic local-first store for feed-style data (CVE/KEV/IOC/news).
// `kind` namespaces a feed; `uid` is the upstream unique id for upsert.
export async function ensureSchema(): Promise<void> {
  const p = getPool();
  await p.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await p.query(`
    CREATE TABLE IF NOT EXISTS feed_items (
      id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      kind      TEXT NOT NULL,
      uid       TEXT NOT NULL,
      data      JSONB NOT NULL,
      risk      INTEGER,
      seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (kind, uid)
    )
  `);
  await p.query('CREATE INDEX IF NOT EXISTS feed_items_kind_seen ON feed_items (kind, seen_at DESC)');
  await p.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      app_user     TEXT,
      ip           TEXT,
      source       TEXT,
      query        TEXT,
      result_count INTEGER
    )
  `);
  await p.query('CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC)');
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
