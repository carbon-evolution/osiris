import type { Collector, FeedRecord } from '../types';

const THREATFOX_URL = 'https://threatfox-api.abuse.ch/api/v1/';

// abuse.ch now requires a free Auth-Key (auth.abuse.ch). Keyless by default:
// skips gracefully when THREATFOX_AUTH_KEY is unset.
export const threatfoxCollector: Collector = {
  kind: 'threatfox',
  cron: '0 */2 * * *', // every 2h
  async pull() {
    const key = process.env.THREATFOX_AUTH_KEY;
    if (!key) {
      console.warn('[OSIRIS][worker] threatfox: no THREATFOX_AUTH_KEY (free at auth.abuse.ch) — skipping');
      return { data: [] };
    }
    const res = await fetch(THREATFOX_URL, {
      method: 'POST',
      headers: { 'Auth-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'get_iocs', days: 1 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`threatfox ${res.status}`);
    return res.json();
  },
  normalize(raw: unknown): FeedRecord[] {
    const items = (raw as { data?: Array<Record<string, unknown>> }).data ?? [];
    return items.map(i => ({
      uid: String(i.id),
      risk: Number(i.confidence_level) || 50,
      data: {
        ioc: i.ioc,
        ioc_type: i.ioc_type,
        malware: i.malware_printable,
        threat_type: i.threat_type,
      },
    }));
  },
};
