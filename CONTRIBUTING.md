# Contributing to OSIRIS

Thanks for your interest in improving OSIRIS! This is a research/educational
OSINT aggregator — contributions that add open data sources, fix feeds, or
improve the map are very welcome.

## Getting set up

```bash
git clone https://github.com/<your-username>/osiris.git
cd osiris
npm install
cp .env.example .env.local   # all keys optional
npm run dev                  # http://localhost:3000
```

Requires **Node.js ≥ 20** and a WebGL2 browser. See the README for full
requirements and the optional API keys.

## Ground rules

- **Never commit secrets.** `.env.local` and key files are git-ignored — keep it
  that way. Don't hardcode API keys, tokens or passwords.
- **Keep it keyless by default.** New data sources should work with no key when
  possible; if a key is required, read it from the environment and **degrade
  gracefully** (return empty, never crash the route) when it's missing.
- **Each external source gets its own timeout** so one slow/dead provider never
  breaks the rest of the map.
- Run `npx tsc --noEmit` before opening a PR; keep TypeScript clean.

## Adding a CCTV source (per-country)

OSIRIS pulls CCTV from official transport-authority feeds. To add a country:

1. Create `src/app/api/cctv/<country>.ts` exporting
   `fetch<Country>Cameras(): Promise<CctvCamera[]>` that fetches the authority's
   API and maps it to `CctvCamera` (`src/app/api/cctv/types.ts`). Use
   `taiwan-highways.ts` as the reference implementation.
2. Wire it into `src/app/api/cctv/route.ts`: import the fetcher, add it to
   `REGION_FETCHERS`, and add a viewport bbox branch in `getRegionsForBounds()`.
3. Set the right `stream_type` (`jpg` / `mjpeg` / `hls` / `iframe`). For
   cross-origin MJPEG hosts, add the host to `ALLOWED_DOMAINS` in
   `src/app/api/cctv/proxy/route.ts`.
4. Verify a region fetch returns cameras and a feed renders.

The roadmap for national highway-CCTV expansion lives in
[`.omo/plans/cctv-gov-highways.md`](.omo/plans/cctv-gov-highways.md).

## Adding a data layer

API routes live under `src/app/api/<domain>/`. Add the layer to the registry in
`src/components/LayerPanel.tsx` (icon + colour), and — if it's a point layer —
register a marker icon in `src/components/mapMarkers.ts`.

## Pull requests

- Keep PRs focused and describe the data source + its limitations.
- Note any geo-restrictions or rate limits for new feeds.
- By contributing you agree your work is released under the project's MIT License.
