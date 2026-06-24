import type { Collector, FeedRecord } from '../types';

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

interface NvdMetricCvss { cvssData?: { baseScore?: number } }
interface NvdCve {
  id: string;
  published?: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: { cvssMetricV31?: NvdMetricCvss[]; cvssMetricV30?: NvdMetricCvss[]; cvssMetricV2?: NvdMetricCvss[] };
}

// Best-available CVSS base score → 0-100 risk.
function cvssToRisk(cve: NvdCve): number | undefined {
  const m = cve.metrics ?? {};
  const score =
    m.cvssMetricV31?.[0]?.cvssData?.baseScore ??
    m.cvssMetricV30?.[0]?.cvssData?.baseScore ??
    m.cvssMetricV2?.[0]?.cvssData?.baseScore;
  return score != null ? Math.round(score * 10) : undefined;
}

export const cveCollector: Collector = {
  kind: 'cve',
  cron: '30 */4 * * *', // every 4h
  async pull() {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const qs = new URLSearchParams({
      resultsPerPage: '2000',
      pubStartDate: start.toISOString(),
      pubEndDate: end.toISOString(),
    });
    // NVD's keyless tier is slow + rate-limited (5 req/30s); give it room.
    const res = await fetch(`${NVD_URL}?${qs.toString()}`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`NVD ${res.status}`);
    return res.json();
  },
  normalize(raw: unknown): FeedRecord[] {
    const vulns = (raw as { vulnerabilities?: Array<{ cve: NvdCve }> }).vulnerabilities ?? [];
    return vulns.map(({ cve }) => ({
      uid: cve.id,
      risk: cvssToRisk(cve),
      data: {
        description: cve.descriptions?.find(d => d.lang === 'en')?.value ?? '',
        published: cve.published,
      },
    }));
  },
};
