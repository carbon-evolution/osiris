import { getTemperaturePayload } from '../route';
import type { Domain, FieldPoint } from './render';

/**
 * OSIRIS — temperature data source registry.
 *
 * Catalogues government / authoritative temperature providers worldwide and wires
 * the ones that are free, keyless, and grid-compatible into the field pipeline.
 * `status: 'live'` providers are selectable backends; `'planned'` ones are catalogued
 * (surfaced in the UI / API) and light up once their requirement (usually an API key)
 * is met.
 */

export type SourceStatus = 'live' | 'planned';
export type SourceKind = 'grid' | 'point' | 'raster';

export interface TempSource {
  id: string;
  label: string;
  agency: string;
  country: string; // ISO-ish region label
  domains: Domain[];
  kind: SourceKind;
  requiresKey: boolean;
  status: SourceStatus;
  url: string;
  note: string;
}

export const SOURCES: TempSource[] = [
  // ── Live, free, keyless, grid-compatible (used by the field renderer) ──
  {
    id: 'open-meteo',
    label: 'Open-Meteo (multi-agency blend)',
    agency: 'Open-Meteo — aggregates NOAA, ECMWF, DWD, Météo-France, JMA, KMA, BoM, CMA…',
    country: 'Global',
    domains: ['land', 'ocean'],
    kind: 'grid',
    requiresKey: false,
    status: 'live',
    url: 'https://open-meteo.com/',
    note: 'Default. Forecast temperature_2m (land) + marine sea_surface_temperature (ocean).',
  },
  {
    id: 'noaa-oisst',
    label: 'NOAA OISST 0.25° (daily SST)',
    agency: 'NOAA NCEI / CoastWatch (ERDDAP)',
    country: 'USA',
    domains: ['ocean'],
    kind: 'grid',
    requiresKey: false,
    status: 'live',
    url: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.html',
    note: 'Gap-free gridded SST (satellite+ship+buoy). One strided CSV request; ~2-week lag.',
  },

  // ── Catalogued (point / regional / raster / key-gated) ──
  {
    id: 'met-norway',
    label: 'MET Norway Locationforecast',
    agency: 'Meteorologisk institutt (MET Norway)',
    country: 'Norway',
    domains: ['land'],
    kind: 'point',
    requiresKey: false,
    status: 'live',
    url: 'https://api.met.no/',
    note: 'LIVE — global point air_temperature (/api/temperature/point, right-click dossier). Point-only per TOS.',
  },
  {
    id: 'nws',
    label: 'NWS api.weather.gov',
    agency: 'NOAA National Weather Service',
    country: 'USA',
    domains: ['land'],
    kind: 'point',
    requiresKey: false,
    status: 'planned',
    url: 'https://www.weather.gov/documentation/services-web-api',
    note: 'US-only gridded forecast; best as a regional overlay, not a global field.',
  },
  {
    id: 'eccc-geomet',
    label: 'ECCC MSC GeoMet (WMS/WCS)',
    agency: 'Environment and Climate Change Canada',
    country: 'Canada',
    domains: ['land'],
    kind: 'raster',
    requiresKey: false,
    status: 'planned',
    url: 'https://eccc-msc.github.io/open-data/msc-geomet/readme_en/',
    note: 'OGC WMS raster / WCS coverage of GDPS air temp. Needs a raster-overlay path.',
  },
  {
    id: 'noaa-ndbc',
    label: 'NOAA NDBC buoys',
    agency: 'NOAA National Data Buoy Center',
    country: 'USA',
    domains: ['ocean'],
    kind: 'point',
    requiresKey: false,
    status: 'live',
    url: 'https://www.ndbc.noaa.gov/',
    note: 'LIVE — ~840 stations of in-situ sea (WTMP) + air (ATMP) temp as markers (/api/temperature/buoys).',
  },
  {
    id: 'dwd-icon',
    label: 'DWD Open Data (ICON)',
    agency: 'Deutscher Wetterdienst',
    country: 'Germany',
    domains: ['land'],
    kind: 'grid',
    requiresKey: false,
    status: 'planned',
    url: 'https://opendata.dwd.de/',
    note: 'Global ICON model as GRIB2 files — needs a GRIB decoder (also available via Open-Meteo).',
  },
  {
    id: 'copernicus-marine',
    label: 'Copernicus Marine (CMEMS) SST',
    agency: 'EU Copernicus Marine Service',
    country: 'EU',
    domains: ['ocean'],
    kind: 'grid',
    requiresKey: true,
    status: 'planned',
    url: 'https://marine.copernicus.eu/access-data/',
    note: 'Authoritative global+regional SST (GHRSST/OSTIA). Free account required.',
  },
  {
    id: 'ecmwf-era5',
    label: 'ECMWF ERA5 (Climate Data Store)',
    agency: 'ECMWF / Copernicus C3S',
    country: 'EU',
    domains: ['land', 'ocean'],
    kind: 'grid',
    requiresKey: true,
    status: 'planned',
    url: 'https://cds.climate.copernicus.eu/',
    note: 'Hourly 0.25° reanalysis, 2m air temp + SST, 1940→present. Free account; NetCDF/queued.',
  },
  {
    id: 'uk-metoffice',
    label: 'UK Met Office DataHub',
    agency: 'Met Office',
    country: 'UK',
    domains: ['land'],
    kind: 'grid',
    requiresKey: true,
    status: 'planned',
    url: 'https://www.metoffice.gov.uk/services/data',
    note: 'Free API key required.',
  },
  {
    id: 'meteo-france',
    label: 'Météo-France AROME/ARPEGE',
    agency: 'Météo-France',
    country: 'France',
    domains: ['land'],
    kind: 'grid',
    requiresKey: true,
    status: 'planned',
    url: 'https://portail-api.meteofrance.fr/',
    note: 'Free API key required (also blended into Open-Meteo).',
  },
  {
    id: 'jma',
    label: 'Japan Meteorological Agency',
    agency: 'JMA',
    country: 'Japan',
    domains: ['land'],
    kind: 'grid',
    requiresKey: false,
    status: 'planned',
    url: 'https://open-meteo.com/en/docs/jma-api',
    note: 'Licence-limited; available (limited) via Open-Meteo /v1/jma.',
  },
  {
    id: 'imd',
    label: 'India Meteorological Department',
    agency: 'IMD',
    country: 'India',
    domains: ['land'],
    kind: 'point',
    requiresKey: true,
    status: 'planned',
    url: 'https://mausam.imd.gov.in/',
    note: 'Regional; access/keys vary by product.',
  },
];

export const LIVE_SOURCE_IDS = SOURCES.filter((s) => s.status === 'live').map((s) => s.id);

export function sourceById(id: string): TempSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** Default live source for a domain. */
export function defaultSource(domain: Domain): string {
  return domain === 'ocean' ? 'open-meteo' : 'open-meteo';
}

/** Resolve a requested source id to a live one valid for the domain (else the default). */
export function resolveSource(domain: Domain, requested: string | null): string {
  const s = requested ? sourceById(requested) : undefined;
  if (s && s.status === 'live' && s.domains.includes(domain) && !s.requiresKey) return s.id;
  return defaultSource(domain);
}

// ── Live grid fetchers ──────────────────────────────────────────────

async function fromOpenMeteo(domain: Domain, step: number): Promise<FieldPoint[]> {
  const payload = await getTemperaturePayload(step);
  const want = domain === 'land' ? 'land' : 'ocean';
  return payload.features
    .filter((f) => f.properties.kind === want)
    .map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], temp: f.properties.temp }));
}

/** NOAA OISST: a whole global SST grid in one strided ERDDAP CSV request (no key). */
async function fromOisst(step: number): Promise<FieldPoint[]> {
  const stride = Math.max(1, Math.round(step / 0.25)); // OISST native resolution is 0.25°
  const q = `sst[(last)][(0.0)][(-77.5):${stride}:(77.5)][(-179.875):${stride}:(179.875)]`;
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.csv?${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'OSIRIS/4.2' } });
  if (!res.ok) throw new Error(`OISST ERDDAP ${res.status}`);
  const text = await res.text();
  const points: FieldPoint[] = [];
  const lines = text.split('\n');
  for (let i = 2; i < lines.length; i++) {
    // columns: time,zlev,latitude,longitude,sst
    const c = lines[i].split(',');
    if (c.length < 5) continue;
    const lat = Number(c[2]);
    const lng = Number(c[3]);
    const temp = Number(c[4]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(temp)) points.push({ lng, lat, temp });
  }
  return points;
}

/** Grid points for a domain from a resolved live source. */
export async function getDomainPoints(domain: Domain, source: string, step: number): Promise<FieldPoint[]> {
  if (source === 'noaa-oisst' && domain === 'ocean') return fromOisst(step);
  return fromOpenMeteo(domain, step);
}

// ── Point lookup (single coordinate) ────────────────────────────────

export interface PointTemp {
  tempC: number;
  source: string; // provider label
  time: string;
}

/**
 * Current temperature at one coordinate. MET Norway (government, no key, but a
 * proper point-forecast API) is primary; Open-Meteo is the fallback. This is the
 * right way to use MET Norway — a single point, not a scraped global grid.
 */
export async function pointTemperature(lat: number, lon: number): Promise<PointTemp | null> {
  // 1. MET Norway Locationforecast (requires a descriptive User-Agent per their TOS)
  try {
    const res = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'OSIRIS/4.2 (github.com/carbon-evolution/osiris)' } },
    );
    if (res.ok) {
      const j = await res.json();
      const t0 = j?.properties?.timeseries?.[0];
      const tempC = t0?.data?.instant?.details?.air_temperature;
      if (typeof tempC === 'number') return { tempC, source: 'MET Norway', time: t0.time };
    }
  } catch {
    /* fall through to Open-Meteo */
  }

  // 2. Open-Meteo fallback
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const j = await res.json();
      const tempC = j?.current?.temperature_2m;
      if (typeof tempC === 'number') return { tempC, source: 'Open-Meteo', time: j.current.time };
    }
  } catch {
    /* give up */
  }
  return null;
}
