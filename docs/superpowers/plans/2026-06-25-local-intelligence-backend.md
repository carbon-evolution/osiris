# OSIRIS Local Intelligence Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve OSIRIS from a Next.js monolith that proxies external APIs on every request into a modular, **local-first** intelligence platform whose datastores live on the user's own infrastructure — so map/OSINT/cyber layers keep working when upstream APIs throttle or go down.

**Architecture:** Keep Next.js as the API gateway / BFF. Add a Dockerised **data plane** (PostgreSQL+PostGIS, Redis, OpenSearch, Neo4j) plus a **Node/TS worker tier** that ingests open feeds on a schedule and writes them to local stores. Route handlers adopt a **local-first-with-live-fallback** pattern: read the local store; if it is empty/stale, fall back to the existing live fetch and backfill. Heavy Threat-Intel Platforms (MISP/OpenCTI) are deferred to later, profile-gated phases because they exceed a MacBook Air's RAM when run alongside everything else.

**Tech Stack:** Next.js 16 (existing), TypeScript, Docker Compose (profile-gated), PostgreSQL 16 + PostGIS 3.4, OpenSearch 2.x, Neo4j 5 Community, Redis 7, Vitest (new), `pg`, `@opensearch-project/opensearch`, `neo4j-driver`, `ioredis`, `node-cron`.

---

## Guiding Decisions (read before starting)

These three decisions diverge from or sharpen the source spec. They are baked into every task below.

1. **Worker/service tier stays Node/TS, not Python/FastAPI.** OSIRIS already ships `src/lib/ssrf-guard.ts`, `src/lib/stealthFetch.ts`, `src/lib/sanctions.ts`, and shared TS types. Reusing them from a single runtime is faster to build and cheaper to operate on a laptop than maintaining a parallel Python service. Revisit FastAPI only if a collector needs a Python-only library (e.g. heavy ML).

2. **Hardware reality → Docker Compose profiles.** Running OpenCTI + MISP + OpenSearch + Neo4j + Postgres simultaneously needs ~32 GB RAM. A MacBook Air cannot. We define three profiles and never require more than one at a time:
   - `lean` — Postgres+PostGIS, Redis. (~2 GB; always-on baseline.)
   - `standard` — `lean` + OpenSearch (single node) + Neo4j Community. (~6–8 GB; the working dev profile.)
   - `tip` — MISP **or** OpenCTI brought up on demand, never both. (Phase 6, heavy.)

3. **`ssrf-guard.ts` is already complete for the spec's IP-block list.** It blocks `0/8 10/8 100.64/10 127/8 169.254/16 172.16/12 192.168/16` plus IPv6 reserved ranges and the cloud-metadata address. The spec's "Add: block these CIDRs" item is **already satisfied** — Phase 5 only adds DNS-rebinding socket pinning on top, not the base list.

**Local-first-with-live-fallback contract** (used by every repointed route):
```
read local store
  → if rows exist AND freshest row age < TTL  → return local (source: "local")
  → else                                       → live fetch (existing code)
                                                 → return live (source: "live")
                                                 → fire-and-forget upsert into local store
```

---

## Phase Map

| Phase | Outcome | Profile | Detail level in this doc |
|---|---|---|---|
| 0 | Data plane up; DB clients + health checks; Vitest harness | lean→standard | **Full TDD steps** |
| 1 | Local cyber-feed ingestion (CVE/KEV/EPSS/ThreatFox/URLhaus/MalwareBazaar); cyber routes go local-first | standard | **Full TDD steps** |
| 2 | Redis caching + rate-limit + audit-log middleware across routes | standard | **Full TDD steps** |
| 3 | Neo4j entity graph; `/api/entity/expand` + EntityGraphPanel local | standard | Milestone outline |
| 4 | PostGIS geospatial cache for flights/ships/incidents | standard | Milestone outline |
| 5 | AI gateway (provider abstraction: Ollama/Gemini/Claude) + SSRF rebinding pin | standard | Milestone outline |
| 6 | MISP / OpenCTI connectors (TIP) | tip | Own plan (outline) |
| 7 | Enterprise: cases, IOC workbench, ATT&CK navigator, threat-actor DB | standard | Own plan (outline) |

Phases 0–2 are written to execute now. Phases 3–7 are milestone outlines with file targets and acceptance criteria; expand each into its own plan via `superpowers:writing-plans` before building it (per the scope-check rule — they are independent subsystems).

---

# Phase 0 — Data Plane & Harness

**Files:**
- Create: `backend/docker-compose.data.yml`
- Create: `backend/.env.example`
- Create: `src/lib/db/postgres.ts`
- Create: `src/lib/db/opensearch.ts`
- Create: `src/lib/db/neo4j.ts`
- Create: `src/lib/db/redis.ts`
- Create: `src/lib/db/index.ts`
- Create: `vitest.config.ts`
- Create: `src/lib/db/postgres.test.ts`
- Modify: `package.json` (scripts + deps)
- Create: `src/app/api/health/local/route.ts`

### Task 0.1: Add the data-plane compose file

- [ ] **Step 1: Write `backend/docker-compose.data.yml`**

```yaml
# Profile-gated local data plane. Bring up with:
#   lean:     docker compose -f backend/docker-compose.data.yml --profile lean up -d
#   standard: docker compose -f backend/docker-compose.data.yml --profile standard up -d
name: osiris-data
services:
  postgres:
    image: postgis/postgis:16-3.4
    profiles: ["lean", "standard"]
    environment:
      POSTGRES_USER: ${PG_USER:-osiris}
      POSTGRES_PASSWORD: ${PG_PASSWORD:-osiris}
      POSTGRES_DB: ${PG_DB:-osiris}
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER:-osiris}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    profiles: ["lean", "standard"]
    ports: ["6379:6379"]
    command: ["redis-server", "--save", "60", "1", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
    volumes: ["redisdata:/data"]

  opensearch:
    image: opensearchproject/opensearch:2.16.0
    profiles: ["standard"]
    environment:
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g"
      - DISABLE_SECURITY_PLUGIN=true
      - DISABLE_INSTALL_DEMO_CONFIG=true
    ulimits:
      memlock: { soft: -1, hard: -1 }
    ports: ["9200:9200"]
    volumes: ["osdata:/usr/share/opensearch/data"]

  neo4j:
    image: neo4j:5-community
    profiles: ["standard"]
    environment:
      NEO4J_AUTH: ${NEO4J_USER:-neo4j}/${NEO4J_PASSWORD:-osirisneo4j}
      NEO4J_server_memory_heap_max__size: 512m
      NEO4J_server_memory_pagecache_size: 512m
    ports: ["7474:7474", "7687:7687"]
    volumes: ["neo4jdata:/data"]

volumes:
  pgdata:
  redisdata:
  osdata:
  neo4jdata:
```

- [ ] **Step 2: Write `backend/.env.example`**

```bash
PG_USER=osiris
PG_PASSWORD=osiris
PG_DB=osiris
PG_HOST=localhost
PG_PORT=5432
OPENSEARCH_URL=http://localhost:9200
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=osirisneo4j
REDIS_URL=redis://localhost:6379
LOCAL_FIRST=true          # master switch: when false, routes use live fetch only
```

- [ ] **Step 3: Bring up the lean profile and verify**

Run: `docker compose -f backend/docker-compose.data.yml --profile lean up -d && docker compose -f backend/docker-compose.data.yml ps`
Expected: `postgres` and `redis` listed as running/healthy.

- [ ] **Step 4: Commit**

```bash
git add backend/docker-compose.data.yml backend/.env.example
git commit -m "feat(backend): add profile-gated local data plane (postgres/redis/opensearch/neo4j)"
```

### Task 0.2: Install deps and Vitest

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
npm install pg ioredis neo4j-driver @opensearch-project/opensearch node-cron
npm install -D vitest @types/pg dotenv
```
Expected: packages added to `package.json`.

- [ ] **Step 2: Add scripts to `package.json`**

Add these keys to the existing `"scripts"` object:
```json
"test": "vitest run",
"test:watch": "vitest",
"data:up": "docker compose -f backend/docker-compose.data.yml --profile standard up -d",
"data:down": "docker compose -f backend/docker-compose.data.yml down",
"workers": "tsx src/workers/scheduler.ts"
```

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
    setupFiles: ['dotenv/config'],
  },
});
```

- [ ] **Step 4: Verify the harness runs (no tests yet)**

Run: `npx vitest run`
Expected: "No test files found" or exit 0 — confirms Vitest resolves.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(backend): add db drivers, node-cron, and vitest harness"
```

### Task 0.3: Postgres client + schema bootstrap (TDD)

- [ ] **Step 1: Write the failing test `src/lib/db/postgres.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool, ensureSchema, closePool } from './postgres';

describe('postgres client', () => {
  beforeAll(async () => { await ensureSchema(); });
  afterAll(async () => { await closePool(); });

  it('connects and reports postgis is installed', async () => {
    const { rows } = await getPool().query('SELECT extname FROM pg_extension');
    const names = rows.map(r => r.extname);
    expect(names).toContain('postgis');
  });

  it('creates the feed_items table', async () => {
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.feed_items') AS t"
    );
    expect(rows[0].t).toBe('feed_items');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/db/postgres.test.ts`
Expected: FAIL — `Cannot find module './postgres'`.

- [ ] **Step 3: Implement `src/lib/db/postgres.ts`**

```typescript
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST ?? 'localhost',
      port: Number(process.env.PG_PORT ?? 5432),
      user: process.env.PG_USER ?? 'osiris',
      password: process.env.PG_PASSWORD ?? 'osiris',
      database: process.env.PG_DB ?? 'osiris',
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

// Generic local-first store for feed-style data (CVE/KEV/IOC/news).
// `kind` namespaces a feed; `uid` is the upstream unique id for upsert.
export async function ensureSchema(): Promise<void> {
  const p = getPool();
  await p.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await p.query(`
    CREATE TABLE IF NOT EXISTS feed_items (
      id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      kind      TEXT NOT NULL,
      uid       TEXT NOT NULL,
      data      JSONB NOT NULL,
      risk      INTEGER,
      seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (kind, uid)
    )
  `);
  await p.query('CREATE INDEX IF NOT EXISTS feed_items_kind_seen ON feed_items (kind, seen_at DESC)');
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/postgres.test.ts`
Expected: PASS (both assertions). Requires `npm run data:up` first.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/postgres.ts src/lib/db/postgres.test.ts
git commit -m "feat(db): postgres pool + feed_items schema with postgis"
```

### Task 0.4: OpenSearch, Neo4j, Redis clients + barrel

- [ ] **Step 1: Write `src/lib/db/opensearch.ts`**

```typescript
import { Client } from '@opensearch-project/opensearch';

let client: Client | null = null;

export function getOpenSearch(): Client {
  if (!client) {
    client = new Client({ node: process.env.OPENSEARCH_URL ?? 'http://localhost:9200' });
  }
  return client;
}

// Idempotent index creation for IOC/feed documents.
export async function ensureIndex(index: string): Promise<void> {
  const os = getOpenSearch();
  const exists = await os.indices.exists({ index });
  if (!exists.body) {
    await os.indices.create({
      index,
      body: {
        mappings: {
          properties: {
            ioc: { type: 'keyword' },
            type: { type: 'keyword' },
            source: { type: 'keyword' },
            risk: { type: 'integer' },
            text: { type: 'text' },
            seen_at: { type: 'date' },
          },
        },
      },
    });
  }
}
```

- [ ] **Step 2: Write `src/lib/db/neo4j.ts`**

```typescript
import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

export function getNeo4j(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI ?? 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER ?? 'neo4j',
        process.env.NEO4J_PASSWORD ?? 'osirisneo4j',
      ),
    );
  }
  return driver;
}

export async function closeNeo4j(): Promise<void> {
  if (driver) { await driver.close(); driver = null; }
}
```

- [ ] **Step 3: Write `src/lib/db/redis.ts`**

```typescript
import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
  }
  return redis;
}
```

- [ ] **Step 4: Write the barrel `src/lib/db/index.ts`**

```typescript
export { getPool, ensureSchema, closePool } from './postgres';
export { getOpenSearch, ensureIndex } from './opensearch';
export { getNeo4j, closeNeo4j } from './neo4j';
export { getRedis } from './redis';
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/opensearch.ts src/lib/db/neo4j.ts src/lib/db/redis.ts src/lib/db/index.ts
git commit -m "feat(db): opensearch, neo4j, redis clients + barrel export"
```

### Task 0.5: Local health route

- [ ] **Step 1: Write `src/app/api/health/local/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { getOpenSearch } from '@/lib/db/opensearch';
import { getRedis } from '@/lib/db/redis';
import { getNeo4j } from '@/lib/db/neo4j';

export const dynamic = 'force-dynamic';

async function ok(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return true; } catch { return false; }
}

export async function GET() {
  const [pg, os, redis, neo] = await Promise.all([
    ok(() => getPool().query('SELECT 1')),
    ok(() => getOpenSearch().cluster.health()),
    ok(() => getRedis().ping()),
    ok(async () => { const s = getNeo4j().session(); await s.run('RETURN 1'); await s.close(); }),
  ]);
  return NextResponse.json({ postgres: pg, opensearch: os, redis, neo4j: neo });
}
```

- [ ] **Step 2: Verify**

Run: `npm run dev` then `curl -s localhost:3000/api/health/local`
Expected (standard profile up): `{"postgres":true,"opensearch":true,"redis":true,"neo4j":true}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/local/route.ts
git commit -m "feat(api): local datastore health probe"
```

**Phase 0 acceptance:** `npm run data:up` brings up standard profile; `npm test` passes; `/api/health/local` returns all `true`.

---

# Phase 1 — Local Cyber-Feed Ingestion

Reduce reliance on NVD/abuse.ch/CISA being reachable per-request. Workers pull on a schedule into Postgres (`feed_items`) + OpenSearch (`osiris-iocs`); the existing cyber routes become local-first.

**Files:**
- Create: `src/workers/types.ts`
- Create: `src/workers/collectors/kev.ts`
- Create: `src/workers/collectors/epss.ts`
- Create: `src/workers/collectors/cve.ts`
- Create: `src/workers/collectors/threatfox.ts`
- Create: `src/workers/collectors/urlhaus.ts`
- Create: `src/workers/collectors/malwarebazaar.ts`
- Create: `src/workers/run.ts`
- Create: `src/workers/scheduler.ts`
- Create: `src/lib/feedStore.ts`
- Create: `src/lib/feedStore.test.ts`
- Create: `src/workers/collectors/kev.test.ts`
- Modify: `src/app/api/cyber-threats/route.ts` (KEV local-first)
- Modify: `src/app/api/cyber-intel/route.ts` (CVE local-first)
- Modify: `src/app/api/malware/route.ts` (ThreatFox/URLhaus local-first)

### Task 1.1: Collector contract + feed store (TDD)

- [ ] **Step 1: Write `src/workers/types.ts`**

```typescript
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
```

- [ ] **Step 2: Write the failing test `src/lib/feedStore.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureSchema, getPool, closePool } from './db/postgres';
import { upsertRecords, readFresh } from './feedStore';

describe('feedStore', () => {
  beforeAll(async () => {
    await ensureSchema();
    await getPool().query("DELETE FROM feed_items WHERE kind = 'test'");
  });
  afterAll(async () => { await closePool(); });

  it('upserts and reads back records', async () => {
    await upsertRecords('test', [{ uid: 'a1', data: { v: 1 }, risk: 50 }]);
    const rows = await readFresh('test', 60_000);
    expect(rows.find(r => r.uid === 'a1')?.data).toEqual({ v: 1 });
  });

  it('treats stale rows as empty', async () => {
    const rows = await readFresh('test', 0); // 0ms TTL → everything is stale
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run it — confirm fail**

Run: `npx vitest run src/lib/feedStore.test.ts`
Expected: FAIL — `Cannot find module './feedStore'`.

- [ ] **Step 4: Implement `src/lib/feedStore.ts`**

```typescript
import { getPool } from './db/postgres';
import type { FeedRecord } from '@/workers/types';

export async function upsertRecords(kind: string, records: FeedRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const p = getPool();
  const values: string[] = [];
  const params: unknown[] = [];
  records.forEach((r, i) => {
    const b = i * 4;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, now())`);
    params.push(kind, r.uid, JSON.stringify(r.data), r.risk ?? null);
  });
  await p.query(
    `INSERT INTO feed_items (kind, uid, data, risk, seen_at)
     VALUES ${values.join(',')}
     ON CONFLICT (kind, uid)
     DO UPDATE SET data = EXCLUDED.data, risk = EXCLUDED.risk, seen_at = now()`,
    params,
  );
  return records.length;
}

export interface StoredItem { uid: string; data: Record<string, unknown>; risk: number | null; seen_at: string; }

export async function readFresh(kind: string, ttlMs: number): Promise<StoredItem[]> {
  const { rows } = await getPool().query(
    `SELECT uid, data, risk, seen_at FROM feed_items
     WHERE kind = $1 AND seen_at > now() - ($2::bigint * interval '1 millisecond')
     ORDER BY seen_at DESC`,
    [kind, ttlMs],
  );
  return rows as StoredItem[];
}
```

- [ ] **Step 5: Run — confirm pass**

Run: `npx vitest run src/lib/feedStore.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/workers/types.ts src/lib/feedStore.ts src/lib/feedStore.test.ts
git commit -m "feat(workers): collector contract + postgres feed store (local-first)"
```

### Task 1.2: KEV collector (TDD on normalize)

- [ ] **Step 1: Write the failing test `src/workers/collectors/kev.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { kevCollector } from './kev';

describe('kev normalize', () => {
  it('maps CISA KEV vulnerabilities to FeedRecords', () => {
    const raw = { vulnerabilities: [
      { cveID: 'CVE-2024-1234', vendorProject: 'Acme', product: 'Web', vulnerabilityName: 'RCE', dateAdded: '2024-01-01' },
    ]};
    const recs = kevCollector.normalize(raw);
    expect(recs).toHaveLength(1);
    expect(recs[0].uid).toBe('CVE-2024-1234');
    expect(recs[0].risk).toBe(100); // KEV = actively exploited
  });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run src/workers/collectors/kev.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/workers/collectors/kev.ts`**

```typescript
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
```

- [ ] **Step 4: Run — confirm pass**

Run: `npx vitest run src/workers/collectors/kev.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workers/collectors/kev.ts src/workers/collectors/kev.test.ts
git commit -m "feat(collector): CISA KEV ingester"
```

### Task 1.3: EPSS, CVE, ThreatFox, URLhaus, MalwareBazaar collectors

Each follows the Task 1.2 shape (`pull` + `normalize`, keyless endpoints). Implement one file per source; no API keys.

- [ ] **Step 1: `src/workers/collectors/epss.ts`** — pull `https://epss.cyentia.com/epss_scores-current.csv.gz` (gunzip), normalize CSV rows `cve,epss,percentile` → `{ uid: cve, risk: round(epss*100), data: { epss, percentile } }`, `kind: 'epss'`, cron `0 5 * * *`.

- [ ] **Step 2: `src/workers/collectors/cve.ts`** — pull NVD recent feed `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=2000&pubStartDate=<24h-ago>` (keyless tier; respect 6s rate-limit between pages with `await new Promise(r=>setTimeout(r,6500))`), normalize `vulnerabilities[].cve` → `{ uid: cve.id, data: { description, metrics, published }, risk: cvssToRisk(cve) }`, `kind: 'cve'`, cron `30 */4 * * *`.

- [ ] **Step 3: `src/workers/collectors/threatfox.ts`** — POST `https://threatfox-api.abuse.ch/api/v1/` body `{"query":"get_iocs","days":1}` (keyless), normalize `data[]` → `{ uid: ioc.id, data: { ioc, ioc_type, malware, confidence }, risk: confidence }`, `kind: 'threatfox'`, cron `0 */2 * * *`. Also index each into OpenSearch `osiris-iocs` (see Task 1.5).

- [ ] **Step 4: `src/workers/collectors/urlhaus.ts`** — pull `https://urlhaus.abuse.ch/downloads/json_recent/` (keyless), normalize → `{ uid: id, data: { url, host, threat, tags }, risk: 90 }`, `kind: 'urlhaus'`, cron `0 */2 * * *`.

- [ ] **Step 5: `src/workers/collectors/malwarebazaar.ts`** — POST `https://mb-api.abuse.ch/api/v1/` body `query=get_recent&selector=time` (keyless), normalize `data[]` → `{ uid: sha256_hash, data: { file_type, signature, tags }, risk: 80 }`, `kind: 'malwarebazaar'`, cron `15 */2 * * *`.

- [ ] **Step 6: Add a normalize test per collector** mirroring `kev.test.ts` (one synthetic raw payload → assert `uid` + `risk` mapping). Run `npx vitest run src/workers/collectors` — Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/workers/collectors
git commit -m "feat(collector): epss, cve, threatfox, urlhaus, malwarebazaar ingesters"
```

### Task 1.4: Runner + scheduler

- [ ] **Step 1: Write `src/workers/run.ts`**

```typescript
import { ensureSchema } from '@/lib/db/postgres';
import { upsertRecords } from '@/lib/feedStore';
import type { Collector } from './types';

export async function runCollector(c: Collector): Promise<number> {
  await ensureSchema();
  try {
    const raw = await c.pull();
    const recs = c.normalize(raw);
    const n = await upsertRecords(c.kind, recs);
    console.log(`[OSIRIS][worker] ${c.kind}: stored ${n}`);
    return n;
  } catch (e) {
    console.error(`[OSIRIS][worker] ${c.kind} failed:`, e instanceof Error ? e.message : e);
    return 0;
  }
}
```

- [ ] **Step 2: Write `src/workers/scheduler.ts`**

```typescript
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
```

- [ ] **Step 3: Add `tsx` and verify a single boot run**

Run: `npm install -D tsx && npm run workers`
Expected: log lines `stored N` for each collector, then `scheduler running`. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add src/workers/run.ts src/workers/scheduler.ts package.json package-lock.json
git commit -m "feat(workers): collector runner + node-cron scheduler with warm boot"
```

### Task 1.5: OpenSearch IOC indexing helper

- [ ] **Step 1: Write `src/lib/iocIndex.ts`**

```typescript
import { getOpenSearch, ensureIndex } from './db/opensearch';

const INDEX = 'osiris-iocs';

export async function indexIocs(docs: Array<{ ioc: string; type: string; source: string; risk: number; text?: string }>): Promise<void> {
  if (docs.length === 0) return;
  await ensureIndex(INDEX);
  const body = docs.flatMap(d => [{ index: { _index: INDEX, _id: `${d.source}:${d.ioc}` } }, { ...d, seen_at: new Date().toISOString() }]);
  await getOpenSearch().bulk({ body, refresh: true });
}

export async function searchIocs(q: string, size = 50) {
  const res = await getOpenSearch().search({
    index: INDEX,
    body: { size, query: { multi_match: { query: q, fields: ['ioc', 'text', 'source'] } } },
  });
  return res.body.hits.hits.map((h: { _source: unknown }) => h._source);
}
```

- [ ] **Step 2: Wire `indexIocs` into threatfox/urlhaus collectors** — after `normalize`, also call `indexIocs(...)` from `runCollector` for IOC-kinds. Add a guard `if (['threatfox','urlhaus'].includes(c.kind))`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/iocIndex.ts src/workers/run.ts
git commit -m "feat(search): opensearch ioc bulk index + search helper"
```

### Task 1.6: Repoint cyber routes to local-first

- [ ] **Step 1: Modify `src/app/api/cyber-threats/route.ts`** — at the top of `GET`, before the existing live CISA fetch:

```typescript
import { readFresh } from '@/lib/feedStore';
// ...inside GET, first:
if (process.env.LOCAL_FIRST !== 'false') {
  const local = await readFresh('kev', 6 * 60 * 60 * 1000); // 6h TTL
  if (local.length > 0) {
    return NextResponse.json({ source: 'local', count: local.length, items: local.map(r => ({ id: r.uid, ...r.data })) },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }
}
// ...fall through to the EXISTING live fetch unchanged...
```

- [ ] **Step 2: Apply the same wrapper to `src/app/api/cyber-intel/route.ts`** using `readFresh('cve', 4*60*60*1000)` and to `src/app/api/malware/route.ts` using `readFresh('threatfox', 2*60*60*1000)` merged with `readFresh('urlhaus', ...)`. Keep existing live code as the fallback path untouched.

- [ ] **Step 3: Manual verification**

Run: `npm run workers` (warm the store, then stop), `npm run dev`, then
`curl -s localhost:3000/api/cyber-threats | head -c 200`
Expected: JSON containing `"source":"local"`.
Then stop Postgres (`npm run data:down`) and re-curl — Expected: falls back to `"source":"live"` (or existing live shape) without a 500.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cyber-threats/route.ts src/app/api/cyber-intel/route.ts src/app/api/malware/route.ts
git commit -m "feat(api): cyber routes are local-first with live fallback"
```

**Phase 1 acceptance:** With workers run once and Postgres up, `/api/cyber-threats`, `/api/cyber-intel`, `/api/malware` return `source:"local"`; with Postgres down they return live data without erroring. `npm test` green.

---

# Phase 2 — Redis Caching, Rate-Limit & Audit Middleware

**Files:**
- Create: `src/lib/cache.ts` + `src/lib/cache.test.ts`
- Create: `src/lib/rateLimit.ts` + `src/lib/rateLimit.test.ts`
- Create: `src/lib/audit.ts`
- Modify: `src/middleware.ts` (apply rate-limit + audit to `/api/osint/*` and `/api/ai/*`)

### Task 2.1: Redis cache helper (TDD)
- [ ] Test `cache.test.ts`: `await cached('k', 1000, fn)` calls `fn` once, second call within TTL returns cached value without re-invoking `fn` (assert call count via a counter).
- [ ] Implement `src/lib/cache.ts`: `cached<T>(key, ttlMs, fn)` — `GET` from Redis; on miss run `fn`, `SET` with `PX ttlMs`, return. JSON-encode values.
- [ ] Commit `feat(cache): redis-backed memoization helper`.

### Task 2.2: Sliding-window rate limit (TDD)
- [ ] Test `rateLimit.test.ts`: 20 calls for an anon key pass, 21st returns `{ allowed: false }`.
- [ ] Implement `src/lib/rateLimit.ts`: `limit(key, max, windowMs)` using Redis `INCR` + `PEXPIRE`. Defaults from spec: user 100/min, anon 20/min.
- [ ] Commit `feat(security): redis sliding-window rate limiter`.

### Task 2.3: Audit log
- [ ] Implement `src/lib/audit.ts`: `audit({ user, time, query, source, resultCount, ip })` → INSERT into a new `audit_log` table (add `CREATE TABLE IF NOT EXISTS audit_log(...)` to `ensureSchema`).
- [ ] Commit `feat(security): audit_log table + writer`.

### Task 2.4: Wire into middleware
- [ ] Modify `src/middleware.ts`: for `/api/osint/*` and `/api/ai/*`, derive client IP, call `limit(...)`; on block return `429`; on allow, `await audit(...)` post-response (fire-and-forget). Respect existing matcher config.
- [ ] Manual verify: hammer `/api/osint/dns?domain=example.com` >20×/min as anon → `429`. Confirm `SELECT count(*) FROM audit_log` increments.
- [ ] Commit `feat(security): rate-limit + audit on osint/ai routes`.

**Phase 2 acceptance:** anon >20 req/min → 429; audit rows recorded; cached routes show reduced upstream calls.

---

# Phase 3 — Neo4j Entity Graph (Milestone Outline)

**Goal:** Back `EntityGraphPanel` / `/api/entity/expand` with Neo4j instead of in-memory resolution.

**Files:** `src/lib/graph.ts` (driver wrappers: `upsertNode`, `upsertEdge`, `expand(id, depth)`), `src/workers/collectors/*` emit graph edges (IOC→malware→actor) alongside feed rows, modify `src/app/api/entity/expand/route.ts`.

**Key model:** `(:Company)-[:OWNS]->(:Domain)-[:RESOLVES]->(:IP)-[:ANNOUNCED_BY]->(:ASN)`, `(:IP)-[:HOSTS]->(:Malware)-[:ATTRIBUTED]->(:ThreatActor)`. Threat collectors write `MERGE` Cypher.

**Acceptance:** clicking a malware node in the UI expands to sibling IOCs + MITRE actor via a single `/api/entity/expand?id=...&depth=2` Neo4j query; works with no external intel backend.

**Expand into own plan before building.**

---

# Phase 4 — PostGIS Geospatial Cache (Milestone Outline)

**Goal:** Cache flights/ships/incidents snapshots in PostGIS so map layers survive upstream outages and support spatial queries (`ST_DWithin` for "threats near point").

**Files:** add `geometry(Point,4326)` tables `geo_aircraft`, `geo_vessels`, `geo_incidents` to `ensureSchema`; `src/lib/geoStore.ts` (`upsertPoints`, `queryBbox`); modify `/api/flights`, `/api/maritime`, `/api/gdelt` to snapshot-on-fetch and serve last-good snapshot when live fails (extends the README's existing "last healthy snapshot" behaviour to a durable store).

**Acceptance:** with OpenSky throttling, `/api/flights` serves the last PostGIS snapshot (`source:"snapshot"`) instead of collapsing; `/api/incidents/near?lat=&lon=&km=` returns spatially-filtered events.

**Expand into own plan before building.**

---

# Phase 5 — AI Gateway + SSRF Rebinding Pin (Milestone Outline)

**Goal:** Remove Gemini lock-in; pin DNS at socket layer to close the TOCTOU gap noted in `ssrf-guard.ts`.

**Files:** `src/lib/ai/provider.ts` (interface `AiProvider { summarize; classify; extractIOC; generateReport }`), adapters `gemini.ts` (wrap existing `ai-engine.ts`), `ollama.ts` (POST `http://localhost:11434/api/generate`, models Qwen3/Llama3/Mistral — keyless/local), `claude.ts`, `openai.ts`; `src/lib/ai/gateway.ts` selects provider by env `AI_PROVIDER`. Refactor `ai-engine.ts` callers to the gateway. Add socket-level IP pin to `ssrf-guard.ts` (custom `lookup` in fetch agent).

**Acceptance:** `AI_PROVIDER=ollama` runs IOC extraction + briefing fully offline with zero API cost; switching to `gemini`/`claude` needs only an env change.

**Expand into own plan before building.**

---

# Phase 6 — MISP / OpenCTI Connectors (Separate Plan, `tip` profile)

**Goal:** Treat MISP and OpenCTI as upstream local TIPs OSIRIS reads from. **Heavy — `tip` profile only, never alongside `standard` on a MacBook Air.**

**Scope:** add `backend/docker-compose.tip.yml` (MISP standalone *or* OpenCTI stack — Elasticsearch/Redis/RabbitMQ/Minio), `src/lib/tip/misp.ts` (PyMISP-equivalent REST: pull events/attributes via API key into `feed_items` + Neo4j), `src/lib/tip/opencti.ts` (GraphQL client). Sync direction: TIP → OSIRIS local stores (one-way) initially.

**This is an independent subsystem — write its own plan with `superpowers:writing-plans` before starting.** Note: requires MISP/OpenCTI API keys (self-issued, not third-party subscriptions), so it stays within the "no external paid API" constraint.

---

# Phase 7 — Enterprise Features (Separate Plan)

**Goal:** SOC-style workflows on top of the local stores.

**Scope (each a sub-feature):**
- **Case management** — Postgres tables `cases`, `tasks`, `notes`, `evidence`, `timeline`; routes under `/api/cases/*`; new `CasePanel.tsx`.
- **IOC workbench** — one-click pivot IP/domain/URL/hash/ASN, querying OpenSearch `osiris-iocs` + Neo4j expand.
- **ATT&CK navigator** — load local MITRE ATT&CK STIX into Neo4j (`enterprise-attack.json`), map actor→technique→detection→mitigation; layer JSON export.
- **Threat-actor DB** — `(:ThreatActor)` nodes (APT29/28/Lazarus/Volt Typhoon/Mustang Panda) linked to campaigns/infra/malware/victims.

**Write its own plan before starting.**

---

## Self-Review Notes

- **Spec coverage:** PostgreSQL+PostGIS (P0/P4), Neo4j (P0/P3), OpenSearch (P0/P1.5), Redis (P0/P2), workers/collectors (P1), collector interface (P1.1 `Collector`), SSRF (already done + P5 pin), rate-limit 100/20 (P2.2), audit fields (P2.3), AI gateway w/ Ollama+local LLM (P5), parallel search aggregator (P1.5 `searchIocs` + P7 workbench `Promise.all`), MISP/OpenCTI (P6), local CVE/KEV/EPSS/MalwareBazaar (P1), enterprise case mgmt/IOC workbench/ATT&CK/threat-actor DB (P7), Docker (P0), RabbitMQ — **intentionally deferred**: node-cron + Postgres covers solo-scale scheduling; RabbitMQ only justified at multi-worker scale (noted here so it isn't a silent gap).
- **Type consistency:** `Collector { kind, cron, pull, normalize }`, `FeedRecord { uid, data, risk }`, `readFresh(kind, ttlMs)`, `upsertRecords(kind, records)`, `indexIocs(docs)` — names consistent across P1 tasks and P3–P7 references.
- **Profiles:** every datastore reachable from one of `lean`/`standard`; `tip` isolated.
- **Keyless constraint honoured:** all P1 collectors hit keyless endpoints (CISA/EPSS/NVD-keyless-tier/abuse.ch). The only keys anywhere are self-issued (MISP/OpenCTI in P6) — no third-party paid subscriptions.
