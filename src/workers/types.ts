export interface FeedRecord {
  uid: string;            // upstream unique id (cve id, ioc value, hash)
  data: Record<string, unknown>;
  risk?: number;          // 0-100 normalized
}

export interface Collector {
  kind: string;                       // namespace e.g. "kev", "cve", "threatfox"
  cron: string;                       // node-cron expression
  pull(): Promise<unknown>;           // fetch raw upstream payload
  normalize(raw: unknown): FeedRecord[]; // raw -> records
}
