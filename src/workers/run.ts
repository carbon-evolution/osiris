import { ensureSchema } from '@/lib/db/postgres';
import { upsertRecords } from '@/lib/feedStore';
import type { Collector } from './types';

export async function runCollector(c: Collector): Promise<number> {
  await ensureSchema();
  try {
    const raw = await c.pull();
    const recs = c.normalize(raw);
    const n = await upsertRecords(c.kind, recs);
    console.log(`[OSIRIS][worker] ${c.kind}: stored ${n}`);
    return n;
  } catch (e) {
    console.error(`[OSIRIS][worker] ${c.kind} failed:`, e instanceof Error ? e.message : e);
    return 0;
  }
}
