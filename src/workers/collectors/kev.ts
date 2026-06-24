import type { Collector, FeedRecord } from '../types';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

interface KevVuln { cveID: string; vendorProject?: string; product?: string; vulnerabilityName?: string; dateAdded?: string; }

export const kevCollector: Collector = {
  kind: 'kev',
  cron: '0 */6 * * *', // every 6h
  async pull() {
    const res = await fetch(KEV_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`KEV ${res.status}`);
    return res.json();
  },
  normalize(raw: unknown): FeedRecord[] {
    const vulns = (raw as { vulnerabilities?: KevVuln[] }).vulnerabilities ?? [];
    return vulns.map(v => ({
      uid: v.cveID,
      risk: 100,
      data: { vendor: v.vendorProject, product: v.product, name: v.vulnerabilityName, dateAdded: v.dateAdded },
    }));
  },
};
