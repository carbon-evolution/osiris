import 'dotenv/config';
import cron from 'node-cron';
import { runCollector } from './run';
import { kevCollector } from './collectors/kev';
import { epssCollector } from './collectors/epss';
import { cveCollector } from './collectors/cve';
import { threatfoxCollector } from './collectors/threatfox';
import { urlhausCollector } from './collectors/urlhaus';
import { malwarebazaarCollector } from './collectors/malwarebazaar';

const collectors = [kevCollector, epssCollector, cveCollector, threatfoxCollector, urlhausCollector, malwarebazaarCollector];

// Run all once at boot so local stores are warm, then schedule.
(async () => {
  for (const c of collectors) await runCollector(c);
  for (const c of collectors) cron.schedule(c.cron, () => runCollector(c));
  console.log('[OSIRIS][worker] scheduler running');
})();
