import 'dotenv/config';
import cron from 'node-cron';
import { runCollector } from './run';
import { kevCollector } from './collectors/kev';
import { epssCollector } from './collectors/epss';
import { cveCollector } from './collectors/cve';
import { threatfoxCollector } from './collectors/threatfox';
import { urlhausCollector } from './collectors/urlhaus';
import { malwarebazaarCollector } from './collectors/malwarebazaar';
import { ensureSchema } from '@/lib/db/postgres';
import { forceRefresh } from '@/lib/cacheFirst';
import { FEEDS } from '@/lib/feeds/registry';
import { pruneQuerySnapshots } from '@/lib/snapshotStore';

const PRUNE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // drop per-query lookups unrefreshed for 7d

const collectors = [kevCollector, epssCollector, cveCollector, threatfoxCollector, urlhausCollector, malwarebazaarCollector];

async function refreshFeed(spec: (typeof FEEDS)[number]): Promise<void> {
  const ok = await forceRefresh(spec.kind, spec.fetch, spec.ttlMs, { minValid: spec.minValid });
  console.log(`[OSIRIS][worker] feed ${spec.kind}: ${ok ? 'refreshed' : 'kept prior (source down/degraded)'}`);
}

// Run all once at boot so local stores are warm, then schedule.
(async () => {
  await ensureSchema();
  // Row-based threat-intel collectors
  for (const c of collectors) await runCollector(c);
  for (const c of collectors) cron.schedule(c.cron, () => runCollector(c));
  // Snapshot feeds (cache-first layer)
  for (const f of FEEDS) await refreshFeed(f);
  for (const f of FEEDS) cron.schedule(f.cron, () => refreshFeed(f));
  // Daily prune of stale per-query (OSINT/geo) snapshots so the cache stays bounded.
  cron.schedule('0 4 * * *', async () => {
    try {
      const n = await pruneQuerySnapshots(PRUNE_MAX_AGE_MS);
      if (n > 0) console.log(`[OSIRIS][worker] pruned ${n} stale per-query snapshots`);
    } catch (e) {
      console.error('[OSIRIS][worker] prune failed:', e instanceof Error ? e.message : e);
    }
  });
  console.log('[OSIRIS][worker] scheduler running');
})();
