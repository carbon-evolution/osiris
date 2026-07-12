# ⬡ OSIRIS — Open Source Intelligence & Reconnaissance Integrated System

A **real-time global intelligence dashboard** that fuses live flight tracking, government highway CCTV networks, earthquake & wildfire monitoring, conflict-zone mapping, cyber-threat intelligence, financial markets, space weather, and 24/7 news into a single GPU-accelerated WebGL2 command center.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-000000.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![MapLibre](https://img.shields.io/badge/MapLibre-GL-4FC3F7.svg)
![Framer Motion](https://img.shields.io/badge/Framer-Motion-0055FF.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 📖 Overview

OSIRIS transforms your browser into a **situational awareness command center**. By layering **40+ open data sources** — from NASA fire detections and USGS earthquakes to live highway CCTV feeds, real-time flight tracking, financial tickers, solar flare activity, and OSINT reconnaissance tools — it delivers a single-pane view of the world as it happens, refreshed in near real time.

Built on **Next.js 16 (App Router)**, **React 19**, and **MapLibre GL JS** (WebGL2), OSIRIS renders thousands of geo-referenced data points simultaneously while maintaining smooth 60 fps navigation.

### What makes OSIRIS different?

- **🌐 Multi-domain fusion** — Aviation · Maritime · Surveillance · Hazards · Conflicts · Cyber · Finance · Space — all on one map
- **🔓 Keyless-first architecture** — Zero API keys required to start. Every data source that needs a key is fully optional and gracefully degrades when absent
- **🛡️ Defensively engineered** — Every upstream fetch has an independent timeout and error handler. A failing source never blocks or crashes the rest of the map
- **🔧 Extensible layer system** — Drop in new country CCTV feeds or entire data domains by following the existing route + component pattern
- **🧠 Built-in AI analyst** — Ask natural-language questions about current intelligence data, or generate full briefings, powered by **Gemini 2.5 Flash with live Google Search grounding** (optional local API key)
- **🔍 Full OSINT toolkit** — 20 reconnaissance tools (port scan, WHOIS, Shodan, DNS, BGP, MAC, phone, data leaks, GitHub recon, URLhaus, sanctions checks, and more) built directly into the UI — geo-locatable results drop verdict-coloured markers on the map and feed a Recon Findings list

---

## 📸 Screenshots

### Google Maps–style light theme & live CCTV

![Taiwan CCTV network with a live freeway feed, on the Google Maps–style light theme](docs/screenshots/overview-cctv-light.png)

*Dense CCTV coverage (Taiwan THB) with a live feed open in the camera viewer.*

### 3D intelligence & threat analysis

| Satellite orbit + Celestrak catalog | Threat-association graph (→ MITRE ATT&CK) |
|---|---|
| ![Satellite orbit on the globe with Celestrak SATCAT metadata](docs/screenshots/satellite-orbit-celestrak.png) | ![Threat-association entity graph linking malware/blocklist/phishing/SSL to MITRE ATT&CK groups](docs/screenshots/threat-association-graph.png) |

| Live malware mesh + entity graph | Light-theme map (infrastructure layer) |
|---|---|
| ![Live malware network mesh with entity graph deep-dive](docs/screenshots/malware-mesh.png) | ![Google Maps–style light theme showing nuclear/power infrastructure](docs/screenshots/light-theme-infrastructure.png) |

*Every resource type has its own map icon — camera for CCTV, flame for wildfire, triangle for incidents, anchor for ports — with colour-coded fallback dots for uncategorized sources.*

### ✈️ Live aviation tracking

![Thousands of live aircraft over North America with a flight detail card open](docs/screenshots/aviation-live-tracking.png)

*Real-time aviation layer — commercial, private, private-jet, and military traffic — with a per-flight detail card (route, altitude, heading) and FlightAware / track / intel actions.*

### 🚢 Live maritime AIS vessel tracking

![Thousands of live vessels rendered as MarineTraffic-style directional arrows coloured by type, converging on the Turkish Straits](docs/screenshots/maritime-vessels-ais.jpg)

*Real-time AIS layer — tens of thousands of live vessels via `aisstream.io`, each rendered as a **MarineTraffic-style directional arrow** coloured by type (container / cargo / tanker / passenger / military) and rotated to its heading. Click any vessel for a detail card in the MarineTraffic pattern: **flag** (from MMSI), **detailed type**, navigational status, speed / course, true heading, rate of turn, draught, destination, reported ETA, IMO / callsign, and "received X ago (AIS source)". Positions are cached locally (Redis) and accumulate over hours. An optional **Kpler / MarineTraffic** enrichment source adds satellite-AIS global coverage and matched destinations when an API grant is provisioned.*

### 🌡️ Global temperature field & weather-aware AI

![Global sea-surface temperature gradient on the 3D globe with the OSIRIS Analyst answering an El Niño weather question](docs/screenshots/temperature-ocean-ai-weather.jpg)

*Smooth global temperature field — ocean SST (NOAA OISST / Open-Meteo) and land air-temp — rendered as EPSG:3857 raster tiles that register precisely on the 3D globe, with a NOAA `BlueWhiteRed` gradient and a live °C legend (top-right). The **OSIRIS Analyst** (right) answers weather/climate questions across the globe — here, El Niño 2026 — grounded in the live temperature field plus web search.*

### 🧠 Every layer feeds the AI analyst

![OSIRIS Analyst answering a cross-domain military-aviation question using live dashboard feeds](docs/screenshots/ai-analyst-all-feeds.jpg)

*The analyst now ingests **all** dashboard layers — aviation, maritime, surveillance, hazards, threat, network, cyber intel, markets, and the temperature field — so it can answer cross-domain questions ("any military flights near active conflict zones?") from whatever OSIRIS currently holds, cached or live.*

### 🛠️ Recon toolkit in action

The 20-tool OSINT/recon toolkit — DNS, WHOIS, certs, port/vuln scans, threat
lookups (URLhaus, isMalicious, DNS-threat), BGP, GitHub, phone, and more. Each
geo-locatable result drops a **verdict-coloured marker** on the map (red =
malicious, cyan = clean) and adds to the **Recon Findings** list in the Cyber
Intel panel. Results render on a self-contained dark card, readable in both themes.

| | |
|---|---|
| ![Recon toolkit](docs/screenshots/recon-01.jpg) | ![Recon toolkit](docs/screenshots/recon-02.jpg) |
| ![Recon toolkit](docs/screenshots/recon-03.jpg) | ![Recon toolkit](docs/screenshots/recon-04.jpg) |
| ![Recon toolkit](docs/screenshots/recon-05.jpg) | ![Recon toolkit](docs/screenshots/recon-06.jpg) |
| ![Recon toolkit](docs/screenshots/recon-07.jpg) | ![Recon toolkit](docs/screenshots/recon-08.jpg) |
| ![Recon toolkit](docs/screenshots/recon-09.jpg) | ![Recon toolkit](docs/screenshots/recon-10.jpg) |
| ![Recon toolkit](docs/screenshots/recon-11.jpg) | ![Recon toolkit](docs/screenshots/recon-12.jpg) |
| ![Recon toolkit](docs/screenshots/recon-13.jpg) | ![Recon toolkit](docs/screenshots/recon-14.jpg) |

---

## 🆕 Recent Updates

**MarineTraffic-style live vessel tracking (July 2026):**

- **Directional vessel arrows** — live AIS ships now render as **arrows coloured by type and rotated to heading** (MarineTraffic-style), instead of plain dots.
- **Rich vessel detail card** — clicking a vessel shows a MarineTraffic-pattern popup: country **flag** (derived from the MMSI's Maritime Identification Digits), **detailed vessel type** (from the raw AIS ship-type code), navigational status, speed / course, true heading, rate of turn, draught, destination, reported ETA, IMO / callsign, and position age + AIS source.
- **Local caching + wider coverage** — vessel positions are cached in Redis with a 6-hour retention window, so sparse-region traffic accumulates over time and survives server restarts.
- **Kpler / MarineTraffic enrichment (optional)** — a fail-soft source that adds satellite-AIS global coverage and matched destinations; authenticates via Kpler's Auth0 client-credentials flow against the Maritime 2.0 GraphQL API and activates automatically once an API grant is provisioned.

**Global temperature field + weather-aware, all-source AI (July 2026):**

- **Global temperature layers** — ocean sea-surface temperature (**NOAA OISST** via ERDDAP, and **Open-Meteo**) plus land 2 m air temperature, IDW-interpolated into a smooth, coastline-clipped field. Free / no API key.
- **Globe-accurate projection** — the field is served as **EPSG:3857 XYZ raster tiles** (the same path NASA GIBS uses), so it registers pixel-for-pixel with the basemap on the 3D globe. (An earlier `image`-overlay approach mis-registered the field ~17° north — fixed.)
- **NOAA `BlueWhiteRed` palette + legend** — all three temperature layers share one gradient and a live **°C colorbar legend** (top-right); the scale is tunable (currently −2…40 °C) so warm ocean/land read yellow→gold→red without over-saturating.
- **Point readings** — right-click anywhere for a live point temperature (MET Norway → Open-Meteo).
- **Weather-aware AI** — the analyst is fed a live global temperature summary, so it can answer weather/climate questions across the globe ("where is it hottest?", "El Niño 2026?").
- **Every layer feeds the AI** — the analyst context now includes **all** dashboard layers (aviation, maritime, surveillance, hazards, threat, network, cyber intel, markets), each compactly summarized and capped, so it can reason across domains from whatever OSIRIS currently holds — cached or live.

**Recon → map/panel integration + readability (June 2026):**

- **Findings on the map** — geo-locatable OSINT lookups (URLhaus, isMalicious, DNS-threat, BGP, IP, Shodan…) now drop **verdict-coloured markers** (red = malicious, cyan = clean) on the map and populate a **Recon Findings** list in the Cyber Intel panel.
- **Readable in both themes** — result cards, map labels (bright text + dark halo), and all panels were reworked to read correctly in the light *and* dark themes; panels are now theme-variable-driven instead of hardcoded.
- **Network panel counts fixed** — Blocklisted IPs / Phishing / SSL Blacklist no longer all show the same total; each counts its own category.

**Recon toolkit hardening (June 2026):**

A full audit of the RECON/OSINT toolkit repaired every broken tool:

- **DNS** — fixed the result renderer (it read a flat shape while the backend returns nested records), so DNS lookups now display again.
- **Dead/changed sources swapped out** — MAC vendor lookup → `api.macvendors.com`; BGP/ASN → **RIPEstat** (bgpview.io is gone); certificate transparency + subdomain enumeration gained a **Cert Spotter** fallback for when crt.sh is down.
- **Auth-gated sources** — URLhaus and isMalicious now report a clear "needs API key" message (and pick up `URLHAUS_KEY` / `ISMALICIOUS_KEY` when set) instead of failing opaquely.
- **Scanner speed/timeouts** — the port scan now runs **in parallel** (was timing out as "Scanner unreachable" on firewalled hosts), and the vuln scan fingerprints HTTP **and** HTTPS. The scanner sidecar now lives in its own repo: [carbon-evolution/osiris-scanner](https://github.com/carbon-evolution/osiris-scanner).
- **Cache correctness** — the cache layer no longer stores error responses, so a transient upstream outage can't get frozen into the cache.

**AI Intelligence Analyst overhaul (June 2026):**

- **Upgraded to Gemini 2.5 Flash** — the previous `gemini-2.0-flash` model was retired by Google; the analyst now runs on `gemini-2.5-flash`.
- **Live web search grounding** — the analyst now augments dashboard data with **Google Search**, so it can verify and answer with current, real-world facts instead of being limited to on-screen feeds.
- **Concise responses** — reworked system prompt: direct answer first, a few sentences by default; long-form reserved for the one-click briefing.
- **Consistent briefings** — added low-temperature generation config, eliminating the contradictory output that previously appeared on repeated briefing runs.
- **Real cyber data in briefings** — live CVEs from the cyber-intel feed are now passed into the analyst's context (the cyber section was previously empty).
- **Readable, self-contained UI** — the chat panel now carries its own dark high-contrast colour scheme, so text stays legible regardless of the active map theme.
- **Mounted on the dashboard** — the analyst panel (floating brain button, bottom-right) is now wired into the main view.

**Local cache-first data layer (June 2026):**

OSIRIS now serves **42 data routes from a local Redis + Postgres cache** instead of hitting upstream APIs on every page load. Data flow: `Resource → local cache → OSIRIS → dashboard`.

- **Quota protection** — a normal page load never calls an upstream API; live APIs are touched only on scheduled/stale refreshes, so free-tier limits aren't burned by browsing.
- **Offline resilience** — if a source is unreachable, the dashboard keeps rendering the **last-known-good** data instead of going blank.
- **Staleness visibility** — every cached response carries `X-OSIRIS-Cache` / `X-OSIRIS-Age` / `X-OSIRIS-Source-Ok` headers, surfaced as freshness badges (bottom-left) and a global **"OFFLINE — serving cached intelligence"** banner when a source is down.
- **Per-query OSINT cache** — on-demand lookups (ip / dns / whois / cve / shodan …) are cached **per target**, so repeated lookups are instant and quota-free; stale per-query entries are pruned automatically.
- **How it's built** — `cacheFirst()` engine (`src/lib/cacheFirst.ts`) over a durable `feed_snapshots` table; pilot feeds (earthquakes/markets/flights) are background-refreshed by the worker scheduler; the rest self-refresh when stale. Requires the local backend (Postgres + Redis) running.

## ✨ Features

### 🗺️ Multi-Layer Map (40+ Data Sources)

Layers are organized into intuitive groups in the left-hand rail. Toggle any layer to overlay its live data source on the map.

#### ✈️ Aviation
- **Commercial / Private / Jets / Military flights** — Live ADS-B data via OpenSky Network + airplanes.live (keyless; a free app key raises rate limits). Server-side caching holds the last healthy snapshot so the layer doesn't collapse when OpenSky throttles anonymously.
- **Flight metadata & routes** — Click any aircraft to enrich it via **adsbdb.com** (free, no key): airline, aircraft type, and **origin → destination** airports.
- **3D flight route arcs** — The origin→destination route is drawn as an elevated parabolic arc via **deck.gl** (`ArcLayer`) that bows up off the map in tilted/3D view.

#### 🚢 Maritime
- **Live AIS vessels** — Tens of thousands of ships streamed via `aisstream.io` (free key), drawn as **MarineTraffic-style directional arrows** coloured by type and rotated to heading. Click a vessel for a MarineTraffic-pattern detail card: country **flag** (derived from the MMSI), **detailed vessel type** (from the raw AIS ship-type code), navigational status, speed / course, true heading, rate of turn, draught, destination, reported ETA, IMO / callsign, and position age + AIS source. Positions are cached locally in Redis (6 h retention) so sparse-region traffic accumulates over time and survives restarts.
- **Kpler / MarineTraffic enrichment** *(optional)* — A fail-soft enrichment source (`src/lib/maritime/kpler.ts`) that adds satellite-AIS global coverage and matched/normalised destinations. Authenticates via Kpler's Auth0 client-credentials flow and reads the Maritime 2.0 GraphQL API; activates automatically once a Kpler API client-grant is provisioned (set `KPLER_BASIC`).
- **Ports, Ships & Chokepoints** — Static naval intelligence + live congestion/traffic derived from the AIS stream
- **🌊 Submarine Cables** — TeleGeography-derived GeoJSON reference overlay
- **🛰️ Satellites** — Real-time positions via TLE → SGP4 propagation (SatNOGS, keyless). Click a satellite to draw **only its orbit** (ground track, antimeridian-split so it hugs the globe), with **KeepTrack-style orbital metadata from Celestrak SATCAT** (free, no key): COSPAR/intl designator, type, owner, inclination, period, apogee, perigee, RCS, launch date & site — plus SatNOGS operator/status/transmitters.

#### 📹 Surveillance
- **CCTV Cameras (~6,000+)** — Government traffic authorities + global open-webcam dataset
  - **Taiwan** (~3,700 cams, THB freeway + provincial roads) — works globally ✅
  - **Indonesia** (Jasa Marga / Bina Marga) — geo-restricted; HLS feeds routed through same-origin proxy ⚠️
  - **Singapore** (data.gov.sg LTA), **Ireland** (TII Traffic), **Iceland** (Vegagerðin), **Lithuania** (eismoinfo.lt) — keyless national networks added in this release ✅ (South Korea ITS & Sweden Trafikverket are wired but need a free per-country key)
  - **EU / US / HK / AU / NZ / Japan + 15+ countries** — Austria (ASFINAG), Australia, Bulgaria, California (Caltrans), Czechia, Estonia, France, Germany, Greece, Italy, Macedonia, Netherlands, New Zealand, North Carolina, Poland, Romania, Serbia, Slovakia, Spain, Switzerland, Turkey, US highways — coverage varies by authority
- **📡 Live News Feeds** — 20+ curated 24/7 streams (NBC, CBS, ABC, Sky News, France24, DW, Al Jazeera, TRT World, Bloomberg, C-SPAN, CBC, Euronews, Al Mayadeen, UKRINFORM, CCTV, NHK, and more) with embedded YouTube players

#### 🌍 Natural Hazards
- **Earthquakes (24h)** — USGS + EMSC merged and deduplicated (keyless; EMSC fills gaps in EU/Asia coverage)
- **🔥 Active Wildfires** — NASA FIRMS (VIIRS S-NPP / NOAA-20 / NOAA-21 + MODIS) + EONET volcanic events, capped at ~3,000 hotspots for performance
- **⛈️ Severe Weather** — NASA EONET + NOAA/NWS alerts + GDACS global cyclones/floods/droughts
- **🌫️ Air Quality** — Real-time AQI measurements
- **☀️ Space Weather** — NOAA SWPC: Kp index (geomagnetic storms), solar flares, CME alerts
- **🌡️ Temperature Field** — Global sea-surface + land air-temperature gradient (keyless): **Sea Temp · Open-Meteo**, **Sea Temp · NOAA OISST** (ERDDAP), and **Land Temp · Open-Meteo**, plus in-situ **NOAA NDBC buoy** readings. Rendered server-side as coastline-clipped EPSG:3857 raster tiles (globe-accurate) with a NOAA `BlueWhiteRed` gradient and a live °C legend. Right-click any point for a live reading (MET Norway → Open-Meteo).

#### ⚡ Threats & Conflict
- **☢️ Nuclear Facilities / Power Plants** — Global static dataset with facility details
- **Global Incidents** — GDELT 2.0 GEO (global event detection) + ACLED (opt-in, requires free account + API access approval)
- **⚔️ Conflict Frontlines** — Current battle lines and territorial control
- **📡 GPS Jamming** — Aggregated interference reports
- **💀 Ransomware Victims** — `ransomware.live` public feed with incident details

#### 🛡️ Cyber Intelligence
| Source | Type | Key Required |
|--------|------|-------------|
| **CVE Feed** (NVD) | Active vulnerability threats | ❌ |
| **CISA KEV** | Known exploited vulnerabilities catalog | ❌ |
| **Spamhaus DROP** | Malicious CIDR blocks | ❌ |
| **Tor Exit Nodes** | Live node list | ❌ |
| **MITRE ATT&CK** | STIX tactical groups & techniques | ❌ |
| **abuse.ch URLhaus** | Malware distribution hosts/URLs | Free Auth-Key (`URLHAUS_KEY`) |
| **Blocklist.de** | Brute-force attackers | ❌ |
| **PhishTank** | Active phishing URLs | ⚠️ now requires registration (feed gated) |
| **AbuseIPDB** | IP reputation (enrichment) | Optional |
| **IsMalicious** | Multi-source threat intelligence | Optional |
| **AlienVault OTX** | Open Threat Exchange pulses | Optional |

#### 📡 Network Intelligence
- **Internet Outage Detection (IODA)** — Georgia Tech IODA API: real-time country-level connectivity disruptions
- **DNS Threat Check** — Spamhaus DNSBL + multi-source reputation

#### 📊 Financial Markets
- **Indices** — S&P 500, NASDAQ futures (ES=F, NQ=F)
- **Defense Stocks** — RTX, LMT, NOC, GD, BA, PLTR
- **Energy** — Crude oil (WTI, Brent)
- **Commodities** — Gold, Silver, Copper, Natural Gas, Wheat, Corn
- **Crypto** — Bitcoin, Ethereum
- **SCM Risk** — Supply chain risk command panel with supplier risk, port congestion, chokepoint analysis, and market alerts
- **Country Risk** — Live country risk ticker with exchange open/close status

#### 🛰️ Space & Satellite
- **Sentinel-1 SAR** — Query recent radar satellite passes (Element84 + Copernicus STAC catalog)
- **CelesTrak TLE Orbits** — Real-time satellite positions
- **Space Weather** — NOAA Kp index, solar flares, CME alerts

#### 🗺️ Display
- **Google Maps–style light theme** — Clean white surfaces, Google-blue accents, CartoDB Voyager basemap, high-contrast readable labels (default). A dark "Ghost Protocol" theme remains available via the toggle.
- **deck.gl 3D overlay** — Elevated flight-route arcs (and the foundation for further 3D map intelligence), rendered with `@deck.gl/mapbox`.
- **Day/Night Terminator** — Real-time computed global sunlight overlay
- **⛰️ 3D Terrain** — MapLibre terrain rendering

### 🔍 OSINT Reconnaissance Toolkit (20 Tools)

A full-featured intelligence panel built into the dashboard with **20 specialized tools**:

| Tool | Description | Data Source |
|------|-------------|-------------|
| **PORT SCAN** | TCP port scanning | `osiris-scanner` sidecar |
| **VULN SWEEP** | CVE vulnerability assessment (HTTP+HTTPS fingerprint → CVE lookup) | `osiris-scanner` sidecar + NVD (`NVD_API_KEY` optional) |
| **DNS** | Full DNS record enumeration (A, AAAA, MX, NS, TXT, CNAME, SOA) | Google DNS-over-HTTPS |
| **WHOIS** | Domain registration intelligence + OFAC sanctions cross-check | RDAP + WHOIS |
| **CERTS** | Certificate Transparency log search | crt.sh → **Cert Spotter** fallback |
| **THREATS** | Multi-source threat reputation | AlienVault OTX + reputation |
| **HEADERS** | HTTP security headers audit | `osiris-scanner` sidecar |
| **SSL/TLS** | SSL certificate & cipher analysis | `osiris-scanner` sidecar |
| **SUBDOMAINS** | Subdomain enumeration | crt.sh → **Cert Spotter** fallback |
| **TECH DETECT** | Technology stack fingerprinting | `osiris-scanner` sidecar |
| **SHODAN IoT** | InternetDB device intelligence | Shodan InternetDB |
| **BGP ROUTE** | BGP routing lookup (IP prefix + ASN) | **RIPEstat** (keyless) |
| **MAC ADDR** | MAC address vendor lookup | `api.macvendors.com` |
| **PHONE INTEL** | Phone number validation & line type | libphonenumber (local) |
| **DATA LEAKS** | Email breach discovery | XposedOrNot (via backend) |
| **GITHUB RECON** | GitHub user/org profiling | GitHub API |
| **IP SWEEP** | CIDR subnet sweep (Shodan InternetDB batch) | Shodan InternetDB |
| **ISMALICIOUS** | Unified threat intel + WHOIS + geo + OTX + passive DNS | ismalicious.com (`ISMALICIOUS_KEY` + `ISMALICIOUS_SECRET`) |
| **URLHAUS** | Malware URL/payload/hash lookup | abuse.ch URLhaus (`URLHAUS_KEY`) |
| **DNS THREAT** | Spamhaus + multi-DNSBL check | Spamhaus DROP/DNSBL |

Results are enriched with automatic **IP geolocation** and **OFAC/SDN sanctions cross-checking** where applicable. The **IP Sweep** tool can visualize discovered devices on the map.

### 🧠 AI Intelligence Analyst

A premium chat interface powered by **Gemini 2.5 Flash** that correlates **every live dashboard layer** — seismic, aviation, maritime, surveillance, hazards, threat, network, cyber, markets, and the global temperature field — **plus live web search** to deliver concise, actionable intelligence assessments.

![OSIRIS AI Analyst answering a web-grounded query over the live cyber-threat layer](docs/screenshots/ai-analyst-web-grounded.png)

*The AI Analyst panel (right) answering in plain, readable text over the European cyber-threat intelligence layer — active CVEs, Spamhaus DROP routing intel, Tor exit nodes, and MITRE ATT&CK.*

- **Natural-language queries** — "What are the top 3 threats right now?", "Assess cyber risks to critical infrastructure"
- **🌐 Live web grounding** — Backed by **Google Search**, so the analyst verifies facts (exact earthquake magnitudes, casualty counts, breaking events, CVE details) against the internet instead of being limited to dashboard data
- **✂️ Concise by default** — Leads with the direct answer in 1–4 sentences; expands only when you ask for a full briefing
- **📋 Full intelligence briefing** — One-click generation of structured operational briefings from all current data, now with consistent, low-temperature output (no more contradictory re-runs)
- **🔑 Optional local API key** — Bring your own Gemini key (stored in localStorage only), or set `GEMINI_API_KEY_1..8` server-side with automatic round-robin rotation
- **📊 All-source context** — Automatically builds intelligence context from **every** live dashboard layer: earthquakes, news, GDELT events, active CVEs, **aviation, maritime, surveillance, hazards, threat-intel, critical infrastructure, cyber intel, markets, and a global temperature summary** — each compactly summarized and capped so it can reason across domains
- **🌡️ Weather/climate aware** — Fed a live global temperature field (ocean + land), so it answers weather questions across the globe ("where is it hottest?", "El Niño 2026?")
- **SIGINT-style UI** — Self-contained dark glass panel with readable high-contrast text, scan-line header animations, markdown rendering, and chat history

### 🔗 Entity Intelligence Graph

A **force-directed relationship graph** that visualizes connections between entities across domains — aircraft, vessels, companies, people, countries, events, sanctions, IPs, APTs, and CVEs. Click any node to expand its relationships and drill into details.

- **Threat-association graph** — Clicking a Live Malware / threat node builds an interconnected web: the IP → its family → sibling IPs of the same family → **every other threat source** (malware families + AbuseIPDB / Blocklist.de / SSL Blacklist / Phishing) → a central **MITRE ATT&CK** hub → tracked APT groups.
- **Local IP resolver** — IP nodes resolve geolocation/ASN locally (free ip-api.com), so the graph works without any external intel backend; unresolvable types degrade gracefully (no error banner).

### 📋 Intelligence Feed

A SIGINT-style news ticker with:
- **Risk-scored aggregation** — Every story rated CRITICAL / HIGH / ELEVATED / LOW based on machine assessment
- **Time-ago display** — See how recent each item is at a glance
- **Geo-tagged** — Click-to-locate on map for any geolocated story
- **AI assessments** — Machine-generated context labels on select articles

### 🎮 Interactive Controls

- **Layer toggles** — Show/hide any data group from the left rail
- **Region presets** — 12 quick-navigate buttons (Global, Europe, Middle East, East Asia, Americas, Ukraine, Africa, SE Asia, Arctic, India, Australia, Sudan) with 🔥 hot-zone indicators
- **Search & geocode** — Coordinate input (lat, lon) or place-name search via Nominatim
- **Click interaction** — Click any map marker for rich detail panels
- **Live video viewer** — Click CCTV cameras or news feeds to watch embedded streams
- **Share & collaborate** — Generate shareable deep-links encoding exact map view + active layers
- **Entity graph** — Full-screen force-directed relationship explorer
- **View full-screen** — Maximize any panel to full-viewport mode
- **Keyboard shortcuts** — Power-user keyboard navigation

---

## 🚀 Installation

### Prerequisites

- **Node.js ≥ 20** (developed on Node 26)
- A modern **WebGL2** browser (Chrome / Edge / Firefox / Safari)
- ~2 GB free RAM for dev server; ~1.5 GB disk for `node_modules`/build
- *(Optional)* `osiris-scanner` sidecar for RECON features

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/carbon-evolution/osiris.git
cd osiris

# 2. Install dependencies
npm install

# 3. Configure (all keys are OPTIONAL)
cp .env.example .env.local

# 4. Launch the dashboard
npm run dev
# → Open http://localhost:3000
```

### Run with RECON Scanner (Optional)

Place the `osiris-scanner` sidecar as a sibling folder, then:

```bash
npm run osiris   # starts scanner (:7700) + dashboard (:3000)
```

Build for production:

```bash
npm run build && npm start
```

---

## 💻 Configuration

**Nothing is required** — every environment variable is optional and the matching feature simply degrades gracefully when unset.

| Variable | Unlocks | Source |
|----------|---------|--------|
| `GEMINI_API_KEY_1..8` | AI Intelligence Analyst (Gemini 2.5 Flash + web search) | [Google AI Studio](https://aistudio.google.com/apikey) (free) |
| `SCANNER_URL`, `SCANNER_KEY` | RECON toolkit (port scan, SSL, DNS, WHOIS, vuln) | Generate a key, match in `osiris-scanner` sidecar |
| `URLHAUS_KEY` | URLhaus malware lookups | [abuse.ch auth](https://auth.abuse.ch/) (free) |
| `ISMALICIOUS_KEY`, `ISMALICIOUS_SECRET` | IsMalicious threat lookups (auth = base64 key:secret) | [IsMalicious](https://ismalicious.com/) |
| `NVD_API_KEY` (scanner) | Faster vuln-scan CVE lookups (50 req/30s vs ~5) | [NVD](https://nvd.nist.gov/developers/request-an-api-key) (free) |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | ACLED structured conflict events | [ACLED Registration](https://acleddata.com/register/) (free, request API access) |
| `FIRMS_API_KEY` | Per-area FIRMS API queries | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/) |
| `OPENSKY_CLIENT_ID/SECRET` | Higher aviation rate limits | [OpenSky Network](https://opensky-network.org/) |
| `AIS_API_KEY` | Live ship positions | [AIS Stream](https://aisstream.io/) |
| `SDK_INGEST_KEY` | Polybolos SDK ingestion webhook | Set your own key |
| `N2YO_API_KEY` | Enriched satellite details | [N2YO](https://www.n2yo.com/) |
| `ABUSEIPDB_KEY` | IP enrichment data | [AbuseIPDB](https://www.abuseipdb.com/) |

> 🔒 `.env.local` and key files (`.abuseipdb_key`, etc.) are git-ignored — credentials are never committed.

---

## 🗄️ Local Intelligence Backend (optional)

The **local backend** (Postgres + Redis) powers the cache-first data layer: it moves threat-intel feeds, curated datasets, and **42 cached data/OSINT routes** onto your own infrastructure, so the dashboard keeps working — serving last-known-good data — when upstream APIs throttle or go down, and free-tier quota isn't burned on every page load. It also adds rate-limiting + audit logging for the abuse-prone routes. Bring it up with `npm run data:up` (or just Postgres + Redis: `docker compose -f backend/docker-compose.data.yml --profile lean up -d`).

It is **fully opt-in**: if you don't start it, OSIRIS runs exactly as before.

### Data plane

A profile-gated Docker Compose stack under `backend/`:

| Profile | Services | Use |
|---------|----------|-----|
| `lean` | PostgreSQL + PostGIS, Redis | baseline (~2 GB RAM) |
| `standard` | `lean` + OpenSearch + Neo4j | dev / full features (~6–8 GB RAM) |
| `tip` | MISP / OpenCTI (on demand) | heavy threat-intel platforms |

```bash
cp backend/.env.example backend/.env      # defaults work as-is
npm run data:up                           # start the standard profile
npm run data:down                         # stop it
```

### Feed ingestion (keyless)

Background collectors sync open feeds into local Postgres + OpenSearch on a schedule:

```bash
npm run workers   # warm the local stores once, then run on cron
```

| Collector | Source | Key |
|-----------|--------|-----|
| **KEV** | CISA Known Exploited Vulnerabilities | ❌ keyless |
| **EPSS** | FIRST exploit-prediction scores | ❌ keyless |
| **CVE** | NVD recent feed | ❌ keyless |
| **ThreatFox / URLhaus / MalwareBazaar** | abuse.ch | optional free Auth-Key (skips gracefully when unset) |

Repointed routes follow a **local-first-with-live-fallback** contract: serve from the local store when fresh, otherwise fall back to the original live fetch — so a missing/stale store never breaks a layer. `/api/cyber-threats` (CISA KEV) ships with this enabled (`LOCAL_FIRST=true`).

### Local dataset connectors — `/api/intel/*`

Surfaces local OSINT/CTI datasets (configurable via `OPENCODE_ROOT`) directly in OSIRIS:

| Route | Source | Surface |
|-------|--------|---------|
| `/api/intel/eurepoc` | EuRepoC global cyber-incident dataset | map layer (country-centroid points) |
| `/api/intel/otcad` | OT/ICS historical attack catalogue | Local Intel panel |
| `/api/intel/ics-advisories` | CISA ICS-CERT advisories | Local Intel panel |
| `/api/intel/recon` | local recon tool outputs | Local Intel panel |
| `/api/intel/findings` | DefectDojo (`DEFECTDOJO_TOKEN`) | cyber panel |

### Security

`guardRequest()` adds Redis-backed rate-limiting (anon 20/min, user 100/min) + Postgres audit logging on the abuse-prone routes (`/api/ai/*`, `/api/osint/sweep`, `/api/osint/shodan`). It runs in the Node route runtime (not Edge middleware) and degrades safely — rate-limit fail-open, audit fail-soft.

### Backend env vars (all optional)

| Variable | Unlocks |
|----------|---------|
| `LOCAL_FIRST` | `true` (default) = local-first serving; `false` = always live |
| `PG_*`, `REDIS_URL`, `OPENSEARCH_URL`, `NEO4J_*` | datastore connection (defaults match the compose file) |
| `OPENCODE_ROOT` | base path for `/api/intel/*` local datasets |
| `THREATFOX_AUTH_KEY`, `URLHAUS_AUTH_KEY`, `MALWAREBAZAAR_AUTH_KEY` | enable abuse.ch collectors |
| `DEFECTDOJO_TOKEN` | enable DefectDojo findings |

Run `npm test` for the backend's Vitest suite, and `GET /api/health/local` to check datastore connectivity.

---

## 🔬 Architecture

### Frontend

A single Next.js (App Router) client dashboard. `page.tsx` owns the global data
store (`dataRef`) and feeds every panel + the map; panels are lazy-loaded via
`next/dynamic`. Two themes (light "core" / dark "ghost") drive all colours through
CSS variables — panels read `var(--bg-panel)` / `var(--text-*)` so they stay
readable in both. The map (MapLibre GL) renders ~40 GeoJSON source layers with
bright-text + dark-halo labels.

```
src/
├── app/
│   ├── layout.tsx           # Root layout + global styles
│   ├── page.tsx             # Dashboard: data store, layer state, panel wiring
│   ├── globals.css          # Theme tokens (core/ghost), .glass-panel, HUD styles
│   └── api/                 # 70+ backend API routes (see Backend)
├── components/
│   ├── OsirisMap.tsx        # Core MapLibre GL map (all geo layers + interactions)
│   ├── LayerPanel.tsx       # Left-rail layer toggles w/ per-category live counts
│   ├── OsintPanel.tsx       # 20-tool OSINT/recon toolkit (dark results card)
│   ├── AiAnalyst.tsx        # Gemini 2.5 Flash analyst chat (web-grounded)
│   ├── CyberIntelPanel.tsx  # CVE/KEV/MITRE/Network intel + Recon Findings list
│   ├── EntityGraphPanel.tsx # Force-directed relationship graph
│   ├── CacheBadges.tsx      # Per-feed freshness badges (X-OSIRIS-* headers)
│   ├── OfflineBanner.tsx    # "Serving cached intelligence" banner
│   ├── LocalIntelPanel.tsx  # Local OTCAD / ICS-CERT / recon datasets
│   ├── IntelFeed.tsx · MarketsPanel.tsx · LiveAlerts.tsx · ScmPanel.tsx
│   ├── SearchBar.tsx · SharePanel.tsx · ViewPresets.tsx · GlobalStatusBar.tsx
│   ├── CameraViewer.tsx · KeyboardShortcuts.tsx · ScaleBar.tsx · ErrorBoundary.tsx
│   └── mapMarkers.ts        # Layer-specific marker renderers
├── lib/
│   ├── cacheFirst.ts        # Cache-first engine (Redis hot + Postgres fallback)
│   ├── snapshotStore.ts     # Durable feed_snapshots store + pruning
│   ├── feeds/               # Cache-first feed registry + route helpers
│   │   ├── registry.ts      #   FeedSpec list (earthquakes/markets/flights…)
│   │   ├── serve.ts         #   serveFeed / withCache / withQueryCache wrappers
│   │   └── earthquakes.ts · markets.ts · flights.ts
│   ├── db/                  # redis.ts · postgres.ts (Postgres+PostGIS schema)
│   ├── feedStore.ts · iocIndex.ts   # Row-based threat-intel store + OpenSearch
│   ├── ai-engine.ts         # Gemini client, prompts, Google Search grounding
│   ├── osint-utils.ts · acled.ts · sanctions.ts
│   ├── ssrf-guard.ts · rateLimit.ts · guard.ts   # SSRF/rate-limit/abuse guards
│   └── sdk/                 # Polybolos SDK (Lattice API adapter)
└── workers/                 # Background collectors + cache refresh (node-cron)
    ├── scheduler.ts         #   warms feeds + threat-intel, daily snapshot prune
    └── collectors/          #   kev · epss · cve · threatfox · urlhaus · malwarebazaar
```

**Key patterns:** (1) **Cache-first data layer** — 42 routes serve from a local
Redis+Postgres cache (`cacheFirst`/`withCache`/`withQueryCache`), so page loads
don't burn upstream quota and stale data still renders offline. (2) **Recon →
map** — OSINT lookups emit verdict-coloured findings onto the map's `scan-targets`
layer + a "Recon Findings" list in the Cyber Intel panel. (3) **Theme-driven
colour** — never hardcode panel text; use the CSS theme variables.

### Backend (API Routes)

Every data domain gets its own isolated route under `src/app/api/`:

| Route | Function | Key Source |
|-------|----------|------------|
| `/api/cctv/*` | CCTV feed aggregation + proxy | Per-country modules (`<country>.ts`) |
| `/api/cctv/proxy` | MJPEG stream proxy (http→https) | CORS bypass |
| `/api/cctv/hls` | HLS stream proxy | CORS bypass |
| `/api/cctv/stream-status` | Stream health monitoring | — |
| `/api/earthquakes` | Merged USGS + EMSC seismic events | Keyless |
| `/api/fires` | NASA FIRMS hotspot data | Keyless (key for API mode) |
| `/api/weather` | NOAA/NWS + GDACS severe weather | Keyless |
| `/api/air-quality` | Real-time AQI | Open AQ |
| `/api/flights` | OpenSky live aircraft | Keyless |
| `/api/flight/enrich` | adsbdb flight route enrichment | Keyless |
| `/api/maritime` | AIS + static port/chokepoint data | Optional AIS key |
| `/api/satellites` | CelesTrak TLE orbits | Keyless |
| `/api/satellites/enrich` | N2YO satellite detail enrichment | Optional key |
| `/api/sentinel` | Sentinel-1 SAR satellite imagery | STAC (keyless) |
| `/api/space-weather` | NOAA Kp index, flares, CMEs | Keyless |
| `/api/gdelt` | GDELT 2.0 GEO global events | Keyless (intermittent) |
| `/api/frontlines` | Conflict territorial control | Multiple OSINT sources |
| `/api/radar` | Georgia Tech IODA internet outages | Keyless |
| `/api/gps-jamming` | GPS interference reports | Aggregated |
| `/api/ransomware` | ransomware.live feed | Keyless |
| `/api/cyber-intel` | NVD CVEs + Spamhaus DROP + Tor + MITRE | Keyless |
| `/api/cyber-threats` | CISA KEV + threat stats | Keyless |
| `/api/malware` | abuse.ch + Blocklist.de + PhishTank | Keyless |
| `/api/country-risk` | Country risk assessment | Multiple sources |
| `/api/geo` | Server-side IP geolocation | ipapi.co + ip-api.com |
| `/api/markets` | Yahoo Finance → Google Finance → static | Keyless |
| `/api/news` | News aggregation + risk scoring | Multiple sources |
| `/api/live-news` | Curated stream manifest | Static |
| `/api/infrastructure/cables` | Submarine cable GeoJSON | TeleGeography (static) |
| `/api/infrastructure/power-plants` | Global power plant data | Open dataset |
| `/api/scm-suppliers` | Supply chain supplier risk | Multiple sources |
| `/api/region-dossier` | Regional intelligence briefs | Aggregated |
| `/api/stats` | Dashboard statistics | Computed |
| `/api/health` | Service health check | — |
| `/api/scanner/*` | RECON toolkit proxy | osiris-scanner sidecar |
| `/api/osint/*` | 18 OSINT tools (see above) | Various |
| `/api/ai/analyze` | Gemini intelligence analysis | Optional user key |
| `/api/ai/briefing` | Full briefing generation | Optional user key |
| `/api/entity/expand` | Entity relationship expansion | Graph DB |
| `/api/sdk/ingest` | Polybolos SDK data ingestion | API key |
| `/api/sdk/stream` | SDK event stream | API key |
| `/api/github-webhook` | GitHub event webhook | Secret |
| `/api/proxy-tiles` | Map tile proxy | — |

### Key Design Principles

- **🧱 Modular isolation** — Every data domain is an independent module with its own fetch, parse, timeout, and error handling
- **🛡️ Fail-soft resilience** — A failing upstream source never blocks the rest of the map. Every fetch has a timeout guard; errors are caught and logged without crashing the app
- **🔄 Stateless API** — Backend routes are stateless and cache-friendly, enabling horizontal scaling
- **🛡️ SSRF protection** — `ssrf-guard.ts` validates all outbound URLs against private IP ranges before fetching
- **🔒 Proxy security** — CCTV proxies enforce strict host allowlists and content-type validation; HLS proxy includes CORS-aware origin headers
- **📦 Rate-limited endpoints** — AI analysis, IP sweep, and scanner endpoints all have per-IP rate limiting
- **🔗 Entity linking** — Sanctions cross-checking and OFAC/SDN matching is built into WHOIS and IP intel routes

---

## 🎨 Visual Design

OSIRIS employs a **military-grade SIGINT aesthetic** with these design choices:

- **Dual theme** — A Google Maps–style **light** theme (default) and a dark **"Ghost Protocol"** theme, toggled live. All colours flow through CSS theme variables so every panel and map label stays high-contrast and readable in both
- **Per-type iconography** — Distinct SVG markers for every data category (camera, flame, aircraft, ship, incident, nuclear, satellite, etc.)
- **Smart clustering** — Thousands of markers intelligently grouped at lower zoom levels to prevent visual overload
- **Day/Night terminator** — Real-time computed overlay showing global daylight regions
- **3D terrain** — MapLibre terrain rendering for elevation context
- **Glass-morphism panels** — Translucent `glass-panel` components with backdrop blur for layered information display
- **GPU-accelerated rendering** — Thousands of WebGL points through MapLibre's hardware pipeline
- **Consistent colour coding** — Each data group (aviation, maritime, hazards, threats, cyber) uses a distinct, immediately recognizable palette
- **Animated scan lines** — Subtle scan-line animations on AI analyst and status panels
- **Pulse indicators** — Real-time connectivity status via animated pulse dots
- **Framer Motion transitions** — Smooth spring animations for panel open/close, tab switches, and modal transitions

---

## 🎓 Educational Value

OSIRIS is ideal for:

- **Understanding OSINT workflows** — See how 40+ open data sources are aggregated, transformed, fused, and displayed in real time
- **Learning geospatial data visualization** — MapLibre GL, WebGL2 rendering, marker clustering, layer management
- **Exploring public data ecosystems** — NASA, USGS, EMSC, GDELT, ACLED, OpenSky, NOAA, CelesTrak, abuse.ch, MITRE, and dozens more
- **Building extensible data pipelines** — Next.js API route patterns, proxy architecture, rate limiting, error handling at scale
- **Cyber threat intelligence** — CVE tracking, CISA KEV monitoring, Spamhaus DROP, Tor node tracking, MITRE ATT&CK mapping
- **Financial market monitoring** — Real-time tickers for defense stocks, commodities, crypto, indices
- **OSINT recon methodology** — 20 practical recon tools covering DNS, WHOIS, Shodan, BGP, phone, email leaks, GitHub profiling
- **AI-assisted intelligence analysis** — Prompt engineering for situational awareness, context construction, briefing generation

---

## ⚠️ Known Limitations

This is a **research and educational aggregator** of third-party open sources. Expect:

- **Upstream outages** — GDELT's GEO API is intermittently unavailable; some CCTV feeds go offline without notice
- **Geo-restrictions** — Indonesia and certain national CCTV feeds only respond to in-country IPs
- **Gated data** — ACLED requires account approval for API access; some sources need free API keys
- **Stale endpoints** — Individual cameras, news streams, and threat feeds come and go over time
- **Rate limits** — Free-tier upstream APIs (ipapi.co: 1,000/day, Shodan InternetDB: per-IP) may throttle
- **Sparse coverage** — GPS jamming, supply chain, and certain threat feeds are best-effort
- **Financial data** — Yahoo Finance scraping may break; falls back to estimated values

**Defensive by design**: Routes are built with independent timeouts and error handling. A failing source never cascades or breaks the rest of the map.

---

## 🤝 Contributing

Contributions are welcome and encouraged. Here's how to help:

- **Add a new data layer** — Create a new route in `src/app/api/` following the existing pattern, add its layer entry in `LayerPanel.tsx`, and create markers in `mapMarkers.ts`
- **Add country CCTV feeds** — See `.omo/plans/cctv-gov-highways.md` for planned additions and integration templates
- **New OSINT tool** — Add a new tab to `OsintPanel.tsx` following the 20 existing tool patterns
- **Improve the AI analyst** — Enhance context construction in `AiAnalyst.tsx` or add new analysis capabilities to `ai-engine.ts`
- **Report bugs** — Open a GitHub issue with reproduction steps
- **Suggest features** — New data sources, UI improvements, performance optimizations
- **Improve documentation** — Fix typos, clarify instructions, expand examples

---

## 📝 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

OSIRIS is built on the open-source [OSIRIS project by simplifaisoul](https://github.com/simplifaisoul/osiris). All third-party data belongs to its respective providers (NASA, USGS, EMSC, GDELT, ACLED, government transport authorities, abuse.ch, MITRE, OpenSky Network, CelesTrak, NOAA, Yahoo Finance, and others) and is subject to their terms — this project is for research and educational use.

---

## 🙏 Acknowledgments

- **NASA FIRMS** — Fire information for resource management
- **USGS & EMSC** — Global earthquake monitoring
- **NOAA SWPC** — Space weather prediction
- **OpenSky Network** — Crowdsourced aviation surveillance
- **GDELT Project** — Global event detection at scale
- **ACLED** — Armed conflict location & event data
- **CelesTrak** — Satellite tracking and orbital data
- **TeleGeography** — Submarine cable mapping
- **Georgia Tech IODA** — Internet outage detection
- **abuse.ch, Spamhaus, Tor Project** — Cyber threat intelligence
- **RIPEstat & Cert Spotter** — BGP/ASN routing data and Certificate Transparency
- **Google (Gemini 2.5 Flash + Search grounding)** — AI intelligence analyst
- **Shodan** — Internet device search (InternetDB)
- **Government transport authorities** — Public CCTV networks: Taiwan THB, Jasa Marga (Indonesia), ASFINAG (Austria), Caltrans (California), and 20+ more national highway agencies
- **Polybolos / Anduril** — Lattice SDK integration pattern
- **Simplifaisoul** — Original OSIRIS open-source project

---

## 📧 Contact

For questions, suggestions, or collaboration, please open an issue on [GitHub](https://github.com/carbon-evolution/osiris).

---

**OSIRIS — See the world through open intelligence. 🌍⬡**
