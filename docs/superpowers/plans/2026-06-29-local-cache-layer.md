# OSIRIS Local Cache Layer — Implementation Plan

**Goal:** Make OSIRIS serve every external resource from a local cache so normal page loads
never hit upstream APIs (preserving free-tier quota), and so the dashboard keeps rendering
last-known-good data even when a source is unavailable.

**Data flow:** `Resource (live API) → local cache (Postgres + Redis) → OSIRIS route → dashboard`

Upstream APIs are touched **only** by scheduled background refreshes, never by a user page load.

## Decisions (confirmed 2026-06-29)

- **Storage:** extend the existing **Postgres + Redis** backend (`backend/docker-compose.data.yml`).
- **Stale UX:** serve last-known-good data **with an age indicator** (and a "source down" marker).
- **Scope:** **foundation + 2–3 pilot feeds first** (earthquakes, markets, flights), then roll out.

## Architecture

- **Redis** = fast hot read-through (sub-second), TTL = feed freshness window.
- **Postgres** `feed_snapshots(kind, data, fetched_at, source_ok)` = durable last-known-good
  (survives restarts; one row per feed holding its whole last response).
- **`cacheFirst(kind, ttl, fetchFn, {minValid})`** engine:
  | State | Behavior |
  |---|---|
  | fresh (Redis or PG within TTL) | serve immediately, no API call |
  | stale, present | serve cached now + refresh in background |
  | stale, refresh fails | keep serving cached, flag `source_ok=false` |
  | never cached | one blocking fetch, store, serve |
  | store unreachable | bypass cache, behave like today (fail-soft) |
- **`minValid(data)`** optional guard ports flights' "don't overwrite good cache with a degraded
  (<300 commercial) snapshot" protection generically.
- **Staleness headers:** `X-OSIRIS-Cache: hit|stale|miss|bypass`, `X-OSIRIS-Age` (seconds),
  `X-OSIRIS-Source-Ok`. Frontend reads them and shows a small "cached Nm ago" badge.
- **Background refresh:** the worker scheduler (`src/workers/scheduler.ts`) refreshes each feed
  on its cron, so quota is spent on schedule, not on page loads.

## Phase 1 deliverables (this phase)

1. `feed_snapshots` table in `ensureSchema()` (`src/lib/db/postgres.ts`).
2. `src/lib/snapshotStore.ts` — read/write/markDown a snapshot.
3. `src/lib/cacheFirst.ts` — the engine + `forceRefresh()` for the worker.
4. `src/lib/feeds/{earthquakes,markets,flights}.ts` — pure fetch functions (logic moved out of routes).
5. `src/lib/feeds/registry.ts` — `FeedSpec` + the 3 pilot specs.
6. `src/lib/feeds/serve.ts` — `serveFeed(spec)` route helper (sets the staleness headers).
7. Rewrite the 3 routes to thin wrappers calling `serveFeed`.
8. Wire the 3 feeds into `scheduler.ts` (boot warm + cron).
9. UI: capture the headers in `page.tsx` `fetchEndpoint` + a `CacheBadges` indicator.

## Phase 2+ (later)

- Roll the pattern out to the remaining ~22 dashboard feeds.
- Phase 3: per-query cache for the ~18 on-demand OSINT lookups.
- Phase 4: global "OFFLINE — serving cached intelligence" banner + cache admin view.

## Testing

- `npm run data:up` (lean profile is enough: Postgres + Redis).
- Hit each pilot route twice → 2nd is `X-OSIRIS-Cache: hit`.
- Kill wifi / block the upstream → route still serves stale with `Source-Ok: false` + age badge.
- Run `npm run workers` → snapshots refresh on cron without any page load.

## Rollback

All additive. Branch `feature/local-cache-layer`. Revert = drop the branch; the 3 routes' old
behavior is preserved in git history. `feed_snapshots` is a new table, harmless if unused.
