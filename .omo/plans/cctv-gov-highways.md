# Plan: Add Government Highway/Motorway/Freeway CCTV feeds

Goal: integrate official transport-authority traffic-camera feeds (highways /
motorways / freeways) for Japan, South Korea, EU, and other APAC countries
into OSIRIS — the same way Taiwan (THB) and Indonesia (Jasa Marga/Bina Marga)
were done. Cameras surface under the existing **CCTV** layer (camera icon).

## Status so far
- DONE & committed `31d175e` — fixed the 5s refresh bug in `CameraViewer`
  (load-driven refresh; slow MJPEG feeds no longer cut off). Applies to ALL cameras.
- Context: `open-webcams.ts` already pulls ~6,000 global webcams keyless
  (incl. JP/KR/EU/APAC cities). This effort adds DENSE national HIGHWAY networks.

## How to add one country (pattern)
1. `src/app/api/cctv/<country>.ts` → `export async function fetch<Country>Cameras(): Promise<CctvCamera[]>`
   mapping the gov API to `CctvCamera` {id, lat, lng, name, city, country,
   feed_url/stream_url, stream_type, source}. (see taiwan-highways.ts as the model)
2. Wire in `src/app/api/cctv/route.ts`:
   - import the fetcher
   - add to `REGION_FETCHERS` (key → fetcher)
   - add a bbox branch in `getRegionsForBounds()` so it loads in that viewport
3. `stream_type`: `mjpeg`/`jpg` (image cams), `hls` (streams), `iframe` (embeds).
4. If the camera image/stream is MJPEG on a cross-origin host, add that host to
   `ALLOWED_DOMAINS` in `src/app/api/cctv/proxy/route.ts` (and upgrade http→https
   there if the host only serves https — see the freeway.gov.tw precedent).
5. Verify live via Playwright: region fetch returns cameras; proxy returns a JPEG.

## Research findings (verified this session)
- **Singapore** ✅ KEYLESS, VERIFIED. `https://api.data.gov.sg/v1/transport/traffic-images`
  → ~90 cams, JPG snapshots, `items[0].cameras[]` = {camera_id, image, location:{latitude,longitude}}.
  stream_type `jpg`, host `images.data.gov.sg`. READY TO IMPLEMENT FIRST.
- **Germany** ⚠️ Autobahn GmbH API keyless (`https://verkehr.autobahn.de/o/autobahn/`
  lists ~100 roads; `/o/autobahn/{road}/services/webcam`) but every road's `webcam`
  array returned EMPTY — webcams likely removed from this API. Needs re-check or drop.
  (germany.ts already exists with some cams.)
- **South Korea** 🔑 ITS open API `https://openapi.its.go.kr/api/NCCTVInfo` needs a
  FREE key (register its.go.kr/opendata). Returns CCTV coords + HLS URLs. type=ex
  (expressway) + type=its (national highways). Use env `ITS_KR_KEY`.
- **UK** ❓ National Highways CCTV — `m.trafficengland.com` API blocked (000).
  Investigate National Highways DATEX II / WebTRIS feed.
- **open-webcams** already covers JP/KR/EU/APAC broadly (keyless).

## Decision needed: key policy
Most dense gov highway APIs gate behind a FREE key/registration. Options:
- Keyless-only → realistically only Singapore + a few.
- Allow free per-country keys (stored opt-in in `.env.local`, like ACLED) →
  unlocks South Korea (ITS), Sweden (Trafikverket), etc. RECOMMENDED.

## Target authorities to integrate (by batch)
**Batch 1 — keyless, quick:** Singapore (data.gov.sg) ✅ verified.
**Batch 2 — free key, high-value dense:** South Korea ITS; Sweden Trafikverket
  (`api.trafikinfo.trafikverket.se`, free key); (Germany Autobahn if webcams revived).
**Batch 3 — investigate/verify (likely keyless or open DATEX):** UK National Highways;
  Belgium Verkeerscentrum Vlaanderen + Brussels Mobiris; Norway Statens vegvesen DATEX;
  Ireland TII; Denmark Vejdirektoratet; Slovenia promet.si.
**Batch 4 — hard / landmark fallback (no clean API):** Japan (NEXCO / Tokyo Metro
  Expressway / Hanshin — no open API; use curated YouTube live cams like japan.ts);
  Malaysia (LLM/PLUS); Thailand (EXAT/DOH); India (NHAI); Philippines (MMDA).

Already in OSIRIS (don't duplicate): Austria, France, Germany(basic), Italy, Spain,
Czechia, Slovakia, Poland, Netherlands, Estonia, Finland, Portugal, Greece, Bulgaria,
Serbia, Macedonia, Turkey, Romania, Switzerland, Taiwan, Hong Kong, Indonesia,
Australia, New Zealand, Japan(landmarks), + US states.

## Next action when resuming
Start Batch 1: implement `singapore.ts` (verified endpoint above), wire region
(bbox lat 1.15–1.48, lng 103.6–104.1), verify live. Then confirm key policy and
proceed to Batch 2.
