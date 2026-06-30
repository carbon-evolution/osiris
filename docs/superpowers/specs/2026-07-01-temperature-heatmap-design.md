# Global Temperature Layer — Design Spec

**Date:** 2026-07-01
**Status:** Approved (revised — see Revision 2)
**Branch:** `feature/temperature-heatmap`

## Revision 2 (2026-07-01) — smooth, domain-split fields

The original hybrid (GIBS raster backdrop + maplibre `heatmap`) shipped but looked
wrong: the MODIS land raster is grainy swath data and the heatmap rendered the 5°
grid as visible circles. Replaced with **server-rendered smooth interpolated fields**:

- `GET /api/temperature/field?domain=ocean|land` — IDW-interpolates that domain's
  points into a colorized image, **upscales + blurs** (sharp) into a continuous
  gradient, and **clips to the coastline** via a rasterized land mask
  (`field/mask.ts`, ray-casting on local `land-110m`). Cached per domain+step at
  `.cache/temperature-field-<domain>-<step>.png`.
- Two **independent toggles** — "Sea Surface Temp" (ocean) and "Land Temp" (land) —
  each projected as a maplibre `image` source spanning the world quad (works on the
  3D globe). Rendering them separately and clipping at the coast avoids blending two
  different physical quantities (SST vs 2 m air temp), so the sea↔land transition is
  a clean coastline rather than a smeared cross-blend.
- Pure helpers in `field/render.ts` (`interpolateField`, `colorRamp`, `buildRGBADomain`)
  with vitest. The GIBS tile proxy (`tile/route.ts`) and `/api/temperature` grid route
  remain (the field route reuses the cached grid); the heatmap + GIBS raster map
  wiring was removed.

The sections below describe the original design for reference.

---


## Goal

Add a single toggleable **"Temperature"** layer to OSIRIS that projects a seamless
global temperature field — ocean **sea-surface temperature (SST)** + land
**2 m air temperature** — using only **free, no-API-key** data sources. The data
is **cached locally first, then projected** as a heatmap on the map.

## Data Sources (all free, no key)

| Field | Source | Endpoint |
|-------|--------|----------|
| Land 2 m air temp | Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast?...&current=temperature_2m` (multi-point via comma-separated lat/lon) |
| Ocean SST | Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine?...&current=sea_surface_temperature` |
| Ocean raster | NASA GIBS | `GHRSST_L4_MUR_Sea_Surface_Temperature` colorized XYZ tiles |
| Land raster | NASA GIBS | `MODIS_Terra_Land_Surface_Temp_Day` colorized XYZ tiles |

All four verified returning live data / HTTP 200 PNG on 2026-07-01.

## Architecture — hybrid, one combined layer

One LayerPanel toggle (`temperature`) drives **three stacked map layers** that read
as one continuous global field:

1. **GIBS SST raster** (ocean) — broad pre-colorized backdrop.
2. **GIBS LST raster** (land) — broad pre-colorized backdrop.
   SST and LST never overlap (water vs land), so together they paint one global field.
3. **Open-Meteo heatmap** — finer, value-driven `heatmap` layer on top, cached locally.

Stack order (bottom→top): basemap → GIBS rasters → Open-Meteo heatmap → existing
icon/circle/symbol layers (markers always stay on top).

### Component 1 — `GET /api/temperature` route

**Responsibility:** produce a cached global temperature grid as GeoJSON plus GIBS
tile metadata.

- **Grid:** lat −80…80, lon −180…175, default step **5°** (`GRID_STEP`, override via
  `?step=`). 5° (~2,376 points) keeps a full refresh well under Open-Meteo's free
  ~10k-calls/day budget even with several refreshes; the heatmap interpolates so the
  coarse grid still looks smooth.
- **Classify** each grid point land vs ocean using the already-local
  `public/data/land-110m.json` (TopoJSON) + `@turf/turf` `booleanPointInPolygon`.
- **Fetch:** land points → Open-Meteo Forecast `temperature_2m`; ocean points →
  Open-Meteo Marine `sea_surface_temperature`. Batched (~100 coords/request,
  comma-separated lat/lon), `Promise.allSettled`, partial failures tolerated.
- **Local cache (dependency-free):** write result to `.cache/temperature-grid.json`
  (gitignored). Serve the file when fresh (`TTL = 6h`); otherwise refetch, rewrite,
  serve. Works even when Redis/Postgres are down — this is the "cache then project"
  guarantee. Wrapped with existing `withCache` as a secondary layer when DB is up.
- **GIBS meta:** resolve latest available date (probe yesterday-UTC, fall back one
  more day on 404) and return SST + LST XYZ URL templates.
- **Output:**
  ```jsonc
  {
    "type": "FeatureCollection",
    "features": [ { "type":"Feature","geometry":{"type":"Point","coordinates":[lng,lat]},
                    "properties": { "temp": 26.4, "kind": "ocean" } } ],
    "meta": { "gibs": { "date":"2026-06-30",
                        "sstUrl":"https://gibs.../{z}/{y}/{x}.png",
                        "lstUrl":"https://gibs.../{z}/{y}/{x}.png" },
              "cached": true, "count": 4032, "tempMin": -41, "tempMax": 43 }
  }
  ```

### Component 2 — OsirisMap.tsx map wiring

- **Init:** add `temperature` GeoJSON source (EMPTY_FC) + a maplibre **`heatmap`**
  layer `temp-heat` (`visibility:'none'`), weighted by `temp`, blue→cyan→green→
  yellow→red ramp, `heatmap-radius`/`intensity` scaling with zoom. Inserted before
  the first existing data layer so markers stay on top.
- **On `data.temperature` arrival (guarded once):** lazily `addSource`/`addLayer`
  the two GIBS rasters (`temp-sst-raster`, `temp-lst-raster`) from `meta.gibs`,
  positioned just below `temp-heat`.
- **Toggle effect:** `activeLayers.temperature` → set heatmap source data + flip
  visibility of all three layers. Mirrors the existing `day_night` special-layer effect.

### Component 3 — page.tsx + LayerPanel registry

- `activeLayers.temperature: false` in initial state.
- Fetch effect: `if (activeLayers.temperature && !fetched) fetchEndpoint('/api/temperature', d => ({ temperature: d }))`.
- LayerPanel: new entry under HAZARD (or new "CLIMATE" group)
  `{ key:'temperature', label:'Temperature (Ocean+Land)', icon:Thermometer, color:'#FF7043', dataKey:'temperature' }`.

## Error Handling

- GIBS tile date not yet published → route falls back one day; if a raster still
  404s, maplibre simply renders nothing for it (no crash).
- Open-Meteo batch failure → serve last good `.cache` file; if none exists, heatmap
  stays empty but GIBS rasters still render.
- Cache write failure → still serve freshly-fetched data (best-effort cache).
- None of these break the rest of the map.

## Testing

- Vitest unit tests (`src/app/api/temperature/grid.test.ts`) for the pure helpers:
  grid generation (count, bounds, step) and land/ocean classification (known
  land point = land, known ocean point = ocean).
- Manual end-to-end: curl `/api/temperature` (shape + cache file written), load
  dashboard, toggle Temperature, confirm heatmap + rasters render, no console errors.

## Scope / YAGNI (explicit non-goals for MVP)

- No time animation / historical playback.
- No per-point click tooltip.
- No server-side GIBS tile proxy/cache (browser/CDN caching only) — documented follow-up.
- No unit conversion UI (°C only).
- No dynamic grid-resolution UI control (fixed `GRID_STEP = 5°`, `?step=` query override only).

## Tunable defaults

- `GRID_STEP = 5°`    (smoothness vs Open-Meteo free-tier call budget; `?step=` override)
- `TTL = 6h`          (temperature changes slowly)
- `BATCH = 100`       (coords per Open-Meteo request)
