# OSIRIS — Data Source Expansion

Additional open data resources for the OSIRIS layers **beyond** the already‑sourced
Satellite, CCTV, and Cyber domains. Curated to match OSIRIS's keyless‑first ethos:
🟢 = no key required · 🟡 = free key · 🔴 = paid/gated.

Each entry notes the endpoint and what it *adds* on top of what is already wired in
the matching `/api/*` route.

---

## ✈️ Aviation — `/api/flights`, `/api/flight/enrich`

Already wired: OpenSky, airplanes.live, adsbdb.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **ADS-B Exchange** | 🟢 | `adsbexchange.com/data` (community feed) / RapidAPI mirror | **Unfiltered** military & government aircraft other feeds block — biggest single gap-filler vs OpenSky |
| **adsb.fi** | 🟢 | `opendata.adsb.fi/api/v2/...` | Community ADS-B, no key, good redundancy when OpenSky throttles |
| **HexDB.io** | 🟢 | `hexdb.io/api` | Aircraft registration → type/owner enrichment (complements adsbdb) |
| **OpenSky `/flights` + `/tracks`** | 🟢 | already partly used; add historical track endpoint | Trail history for a selected aircraft |

> Highest value: **ADS-B Exchange** for unfiltered mil/gov coverage; **adsb.fi** as a keyless failover.

---

## 🚢 Maritime — `/api/maritime`

Already wired: aisstream.io (optional key), static ports/chokepoints.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **AISHub** | 🟡 | `aishub.net` JSON/XML/CSV — free if you feed data | Aggregated global AIS, alternate to aisstream |
| **NOAA / USCG AIS** | 🟢 | `marinecadastre.gov` (historical bulk) | US coastal historical AIS for backfill/analysis |
| **GFW (Global Fishing Watch)** | 🟡 | `globalfishingwatch.org/our-apis` | Fishing-vessel activity, AIS-gap ("dark vessel") events |
| **USNI Fleet Tracker** | 🟢 | scraped weekly post (`news.usni.org`) | Carrier/amphib group positions — military maritime layer |

> Highest value: **GFW** dark-vessel events + **USNI** fleet tracker for a military maritime layer.

---

## 🌍 Natural Hazards — `/api/earthquakes`, `/api/fires`, `/api/weather`, `/api/air-quality`

Already wired: USGS, EMSC, NASA FIRMS, EONET, NOAA/NWS, GDACS, OpenAQ.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **GDACS GeoJSON** | 🟢 | `gdacs.org/gdacsapi/api/events/geteventlist/MAP` | Unified multi-hazard alert feed w/ green/orange/red scoring (cyclone, flood, drought, EQ, volcano) |
| **NOAA NCEI Hazel** | 🟢 | `ngdc.noaa.gov/hazel` (Swagger) | **Historical** tsunami / significant-EQ / volcano catalogs for context |
| **NOAA NHC / CPHC** | 🟢 | `nhc.noaa.gov/CurrentStorms.json` | Active hurricane/typhoon track cones & forecast positions |
| **NWS Alerts API** | 🟢 | `api.weather.gov/alerts/active` | Granular US warnings (tornado, flash-flood) — finer than GDACS |
| **GloFAS / Copernicus EFAS** | 🟡 | `cds.climate.copernicus.eu` | Global flood forecasting |
| **Open-Meteo** | 🟢 | `api.open-meteo.com` (+ `air-quality-api`, `flood-api`) | Keyless weather, AQI, and river-flood overlays — no-key OpenAQ backup |
| **Smithsonian GVP** | 🟢 | `volcano.si.edu` WFS | Authoritative volcano catalog + weekly activity |

> Highest value: **NHC CurrentStorms.json** (live cyclone cones) and **Open-Meteo flood-api** (keyless flood layer).

---

## ⚡ Threats & Conflict — `/api/gdelt`, `/api/frontlines`, `/api/gps-jamming`, `/api/ransomware`

Already wired: GDELT 2.0, ACLED (gated), ransomware.live.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **GDELT DOC 2.0 API** | 🟢 | `api.gdeltproject.org/api/v2/doc/doc` | Keyless article/event query when GEO feed is down (it often is) |
| **UCDP** | 🟢 | `ucdpapi.pcr.uu.se/api` | Academic georeferenced conflict events — ACLED alternative, no gating |
| **GPSJam.org** | 🟢 | `gpsjam.org/data/YYYY-MM-DD.json` (daily H3 tiles) | Keyless GPS-jamming H3 hexagons from ADS-B Exchange NIC values |
| **Flightradar24 GPS Jamming** | 🔴 | `flightradar24.com/data/gps-jamming` (no public API) | Reference/visual cross-check; 6-hr refresh |
| **GNSS Metrics / GPSwise** | 🟡 | `gpswise.aero`, `gnssmetrics.com` | Aviation GNSS-interference API w/ alerts |
| **LiveUAMap** | 🔴 | scrape-only | Crowd-tagged frontline incidents |

> Highest value: **GPSJam daily JSON** (drop-in keyless GPS-jamming layer) and **UCDP** (ungated conflict events).

---

## 📡 Network Intelligence — `/api/radar`

Already wired: Georgia Tech IODA, Spamhaus DNSBL.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **Cloudflare Radar API** | 🟡 | `developers.cloudflare.com/api/.../radar` (CC BY-NC 4.0) | Confirmed outages, traffic anomalies, **BGP route leaks & origin hijacks**, real-time routing |
| **RIPEstat** | 🟢 | `stat.ripe.net/data/...` | Keyless BGP / ASN / prefix / abuse-contact data |
| **BGPView** | 🟢 | `api.bgpview.io` | ASN ↔ prefix ↔ org lookups (pairs with existing BGP recon tool) |
| **NetBlocks** | 🔴 | reports only | Curated nation-scale shutdown confirmations |

> Highest value: **Cloudflare Radar** (BGP hijack/leak detection is a genuinely new capability) + **RIPEstat** keyless routing.

---

## 📊 Financial Markets — `/api/markets`

Already wired: Yahoo→Google→static fallback chain.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **Stooq** | 🟢 | `stooq.com/q/l/?s=SYM&f=...&e=csv` | Keyless CSV quotes for indices/commodities/FX — robust Yahoo fallback |
| **CoinMarketCap keyless** | 🟢 | public keyless endpoints (quotes/global/listings) | Crypto without signup |
| **CoinGecko** | 🟢 | `api.coingecko.com/api/v3` | Keyless crypto + market caps |
| **Frankfurter / ECB** | 🟢 | `api.frankfurter.app` | Keyless FX rates (ECB-sourced) |
| **Alpha Vantage / Finnhub / FMP** | 🟡 | respective REST APIs | Fundamentals, earnings calendars if you want enrichment |

> Highest value: **Stooq CSV** as a keyless market fallback and **Frankfurter** for FX — both eliminate Yahoo scraping fragility.

---

## 📰 News & Live Feeds — `/api/news`, `/api/live-news`

Already wired: curated streams + risk-scored aggregation.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **GDELT DOC API** | 🟢 | `api.gdeltproject.org/api/v2/doc/doc?format=json` | Global multilingual article firehose w/ tone/geo |
| **GDELT GEO 2.0** | 🟢 | already used | (keep) geo-tagged events |
| **RSS aggregation** | 🟢 | Reuters/AP/AlJazeera/BBC RSS | Direct headline feeds, no key |
| **Mediastack / NewsAPI** | 🟡 | respective APIs | Structured query + free tier if you want filtering |

> Highest value: **GDELT DOC API** (keyless, multilingual, tone-scored — strongest news backbone).

---

## 🏗️ Critical Infrastructure — `/api/infrastructure/*`

Already wired: TeleGeography cables (static), open power-plant dataset.

| Source | Key | Endpoint / Notes | Adds |
|---|---|---|---|
| **HIFLD Open (DHS)** | 🟢 | `hifld-geoplatform.hub.arcgis.com` | 400+ layers: substations, pipelines, ports, hospitals, comms towers (GeoJSON/WFS) |
| **WRI Global Power Plant DB** | 🟢 | `datasets.wri.org/dataset/globalpowerplantdatabase` | ~35k plants w/ fuel type & capacity — richer than current set |
| **OpenInfraMap / OSM** | 🟢 | `openinframap.org` (Overpass API) | Live electricity/telecom/oil/gas grid from OSM |
| **US Energy Atlas (EIA)** | 🟢 | `atlas.eia.gov` (GeoJSON/WMS/WFS) | US energy infra w/ direct GeoJSON exports |
| **TeleGeography Submarine Cable Map** | 🟢 | `github.com/telegeography/www.submarinecablemap.com` GeoJSON | Cable landing points + segment metadata (already partly used) |
| **IAEA PRIS** | 🟡 | `pris.iaea.org` | Authoritative reactor list/status for the nuclear layer |

> Highest value: **HIFLD** (single richest keyless infra source) + **WRI Global Power Plant DB** to upgrade the existing power layer.

---

## Recommended next adds (ranked)

1. **ADS-B Exchange / adsb.fi** — unfiltered mil/gov aircraft + keyless flight failover.
2. **GPSJam daily JSON** — drop-in keyless GPS-jamming layer.
3. **Cloudflare Radar** — BGP hijack/leak + confirmed-outage detection (new capability).
4. **HIFLD + WRI GPPD** — major infrastructure depth, all keyless.
5. **NHC CurrentStorms.json + Open-Meteo flood-api** — live cyclone cones + keyless floods.
6. **UCDP** — ungated conflict-event alternative to ACLED.
7. **Stooq + Frankfurter** — kill the Yahoo-scraping fragility in markets.
8. **GDELT DOC API** — keyless multilingual news backbone.

All follow OSIRIS's existing pattern: one isolated `/api/*` route with its own timeout +
fail-soft handler, a `LayerPanel.tsx` toggle, and a marker renderer in `mapMarkers.ts`.
