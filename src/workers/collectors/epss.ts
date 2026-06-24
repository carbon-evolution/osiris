import { gunzipSync } from 'node:zlib';
import type { Collector, FeedRecord } from '../types';

const EPSS_URL = 'https://epss.cyentia.com/epss_scores-current.csv.gz';

export const epssCollector: Collector = {
  kind: 'epss',
  cron: '0 5 * * *', // daily 05:00
  async pull() {
    const res = await fetch(EPSS_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`EPSS ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return gunzipSync(buf).toString('utf8');
  },
  normalize(raw: unknown): FeedRecord[] {
    const text = String(raw);
    const out: FeedRecord[] = [];
    for (const line of text.split('\n')) {
      // Skip the "#model_version..." comment and the "cve,epss,percentile" header.
      if (!line || line.startsWith('#') || line.startsWith('cve,')) continue;
      const [cve, epss, percentile] = line.split(',');
      if (!cve || !epss) continue;
      out.push({
        uid: cve.trim(),
        risk: Math.round(parseFloat(epss) * 100),
        data: { epss: parseFloat(epss), percentile: parseFloat(percentile) },
      });
    }
    return out;
  },
};
