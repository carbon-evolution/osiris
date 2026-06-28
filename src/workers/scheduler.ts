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
  console.log('[OSIRIS][worker] scheduler running');
})();
