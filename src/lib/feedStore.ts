import { getPool } from './db/postgres';
import type { FeedRecord } from '@/workers/types';

export async function upsertRecords(kind: string, records: FeedRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const p = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  records.forEach((r, i) => {
    const b = i * 4;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, now())`);
    params.push(kind, r.uid, JSON.stringify(r.data), r.risk ?? null);
  });
  await p.query(
    `INSERT INTO feed_items (kind, uid, data, risk, seen_at)
     VALUES ${values.join(',')}
     ON CONFLICT (kind, uid)
     DO UPDATE SET data = EXCLUDED.data, risk = EXCLUDED.risk, seen_at = now()`,
    params,
  );
  return records.length;
}

export interface StoredItem { uid: string; data: Record<string, unknown>; risk: number | null; seen_at: string; }

export async function readFresh(kind: string, ttlMs: number): Promise<StoredItem[]> {
  const { rows } = await getPool().query(
    `SELECT uid, data, risk, seen_at FROM feed_items
     WHERE kind = $1 AND seen_at > now() - ($2::bigint * interval '1 millisecond')
     ORDER BY seen_at DESC`,
    [kind, ttlMs],
  );
  return rows as StoredItem[];
}
