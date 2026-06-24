import { ensureSchema } from '@/lib/db/postgres';
import { upsertRecords } from '@/lib/feedStore';
import { indexIocs } from '@/lib/iocIndex';
import type { Collector } from './types';

const IOC_KINDS = ['threatfox', 'urlhaus'];

export async function runCollector(c: Collector): Promise<number> {
  await ensureSchema();
  try {
    const raw = await c.pull();
    const recs = c.normalize(raw);
    const n = await upsertRecords(c.kind, recs);
    // IOC feeds also go to OpenSearch for fast full-text pivot.
    if (IOC_KINDS.includes(c.kind) && recs.length) {
      await indexIocs(recs.map(r => ({
        ioc: String(r.data.ioc ?? r.data.url ?? r.uid),
        type: String(r.data.ioc_type ?? 'url'),
        source: c.kind,
        risk: r.risk ?? 0,
        text: JSON.stringify(r.data),
      })));
    }
    console.log(`[OSIRIS][worker] ${c.kind}: stored ${n}`);
    return n;
  } catch (e) {
    console.error(`[OSIRIS][worker] ${c.kind} failed:`, e instanceof Error ? e.message : e);
    return 0;
  }
}
