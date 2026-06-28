import { getPool, ensureSchema } from './db/postgres';

/**
 * Durable whole-feed snapshot store (Postgres `feed_snapshots`).
 * One row per feed `kind`, holding its last full response — the
 * last-known-good data served when upstream is unavailable.
 */

export interface Snapshot {
  data: unknown;
  fetchedAt: number; // epoch ms
  sourceOk: boolean; // was the last refresh attempt successful?
}

// Create the schema lazily, once, so the API route path (which never runs the
// worker's ensureSchema) can read/write snapshots on first use.
let schemaReady: Promise<void> | null = null;
function ready(): Promise<void> {
  if (!schemaReady) schemaReady = ensureSchema();
  return schemaReady;
}

export async function readSnapshot(kind: string): Promise<Snapshot | null> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT data, (extract(epoch FROM fetched_at) * 1000)::bigint AS fetched_ms, source_ok
       FROM feed_snapshots WHERE kind = $1`,
    [kind],
  );
  if (rows.length === 0) return null;
  return {
    data: rows[0].data,
    fetchedAt: Number(rows[0].fetched_ms),
    sourceOk: rows[0].source_ok,
  };
}

export async function writeSnapshot(kind: string, data: unknown, sourceOk: boolean): Promise<void> {
  await ready();
  await getPool().query(
    `INSERT INTO feed_snapshots (kind, data, fetched_at, source_ok)
       VALUES ($1, $2, now(), $3)
     ON CONFLICT (kind)
       DO UPDATE SET data = EXCLUDED.data, fetched_at = now(), source_ok = EXCLUDED.source_ok`,
    [kind, JSON.stringify(data), sourceOk],
  );
}

/** Mark the source as down without touching the cached payload. */
export async function markSourceDown(kind: string): Promise<void> {
  await getPool().query(`UPDATE feed_snapshots SET source_ok = false WHERE kind = $1`, [kind]);
}

/**
 * Delete stale per-query snapshots (keys containing '?', i.e. OSINT/geo lookups)
 * older than `maxAgeMs`. Dashboard feed snapshots (no '?') are always kept — they
 * are a bounded set and we want them as offline fallback. Returns rows removed.
 */
export async function pruneQuerySnapshots(maxAgeMs: number): Promise<number> {
  await ready();
  const { rowCount } = await getPool().query(
    `DELETE FROM feed_snapshots
       WHERE kind LIKE '%?%'
         AND fetched_at < now() - ($1::bigint * interval '1 millisecond')`,
    [maxAgeMs],
  );
  return rowCount ?? 0;
}
