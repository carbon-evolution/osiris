import type { Collector, FeedRecord } from '../types';

const URLHAUS_URL = 'https://urlhaus-api.abuse.ch/v1/urls/recent/';

// abuse.ch now requires a free Auth-Key. Keyless by default: skips when unset.
export const urlhausCollector: Collector = {
  kind: 'urlhaus',
  cron: '0 */2 * * *', // every 2h
  async pull() {
    const key = process.env.URLHAUS_AUTH_KEY;
    if (!key) {
      console.warn('[OSIRIS][worker] urlhaus: no URLHAUS_AUTH_KEY (free at auth.abuse.ch) — skipping');
      return { urls: [] };
    }
    const res = await fetch(URLHAUS_URL, {
      method: 'POST',
      headers: { 'Auth-Key': key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`urlhaus ${res.status}`);
    return res.json();
  },
  normalize(raw: unknown): FeedRecord[] {
    const obj = raw as Record<string, unknown>;
    const rows: Array<Record<string, unknown>> = Array.isArray(obj.urls)
      ? (obj.urls as Array<Record<string, unknown>>)
      : Array.isArray(obj)
        ? (obj as unknown as Array<Record<string, unknown>>)
        : (Object.values(obj).flat() as Array<Record<string, unknown>>);
    return rows
      .filter(r => r && r.id)
      .map(r => ({
        uid: String(r.id),
        risk: 90,
        data: { url: r.url, host: r.host, threat: r.threat, tags: r.tags },
      }));
  },
};
