/**
 * OSIRIS — Temperature field: pure interpolation + colorization.
 *
 * Turns the sparse Open-Meteo grid into a dense, smoothly-interpolated RGBA
 * raster (inverse-distance weighting) ready to be upscaled/blurred into a
 * continuous global temperature gradient. No I/O — unit-testable.
 */

export interface FieldPoint {
  lng: number;
  lat: number;
  temp: number;
}

export const LAT_TOP = 80;
export const LAT_BOT = -80;

// ── Web-Mercator vertical reprojection ──────────────────────────────
// MapLibre image sources are placed in Web-Mercator space, so field rasters must be
// spaced uniformly in mercator-Y (not linear latitude) to line up with the globe.

export function mercatorY(latDeg: number): number {
  const r = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}
export function invMercatorLat(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}
/** Latitude of each row when an `h`-row image is spaced uniformly in mercator over ±latMax. */
export function mercatorRowLats(h: number, latMax = LAT_TOP): Float64Array {
  const yTop = mercatorY(latMax);
  const yBot = mercatorY(-latMax);
  const out = new Float64Array(h);
  for (let y = 0; y < h; y++) out[y] = invMercatorLat(yTop - ((y + 0.5) / h) * (yTop - yBot));
  return out;
}

// Color ramp: temperature °C → RGB. NOAA ERDDAP `BlueWhiteRed` palette — the exact
// gradient the OISST layer is server-rendered with — sampled from the ERDDAP colorbar
// so the Open-Meteo sea/land fields match the OISST layer. Keyed evenly across −2…60 °C
// (white midpoint ~19 °C) so warm ocean/land read yellow→gold→orange with red on the
// hottest spots: navy → blue → cyan → white → yellow → orange → dark red, clamped at ends.
const RAMP: [number, [number, number, number]][] = [
  [-2, [0, 0, 110]],
  [1, [0, 0, 137]],
  [4, [0, 0, 191]],
  [7, [0, 32, 236]],
  [10, [0, 111, 255]],
  [13, [19, 213, 255]],
  [16, [92, 249, 255]],
  [19, [209, 255, 255]],
  [22, [255, 255, 183]],
  [25, [255, 243, 78]],
  [28, [255, 203, 0]],
  [31, [255, 91, 0]],
  [34, [227, 23, 0]],
  [37, [181, 0, 0]],
  [40, [140, 0, 0]],
];

/** Map a temperature (°C) to an RGB triple via the ramp (clamped at the ends). */
export function colorRamp(t: number): [number, number, number] {
  if (t <= RAMP[0][0]) return RAMP[0][1];
  if (t >= RAMP[RAMP.length - 1][0]) return RAMP[RAMP.length - 1][1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [t0, c0] = RAMP[i];
    const [t1, c1] = RAMP[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/** Shortest signed longitude difference in degrees, accounting for ±180 wrap. */
export function lngDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Interpolate temperatures onto a W×H grid via inverse-distance weighting.
 * Returns row-major temps; row 0 is the north edge (LAT_TOP).
 */
export function interpolateField(points: FieldPoint[], w: number, h: number, power = 2, rowLat?: Float64Array): Float32Array {
  const out = new Float32Array(w * h);
  const halfPow = power / 2;
  for (let y = 0; y < h; y++) {
    const lat = rowLat ? rowLat[y] : LAT_TOP - ((y + 0.5) / h) * (LAT_TOP - LAT_BOT);
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (let x = 0; x < w; x++) {
      const lng = -180 + ((x + 0.5) / w) * 360;
      let num = 0;
      let den = 0;
      let exact = NaN;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const dLat = lat - p.lat;
        const dLng = lngDelta(lng, p.lng) * cosLat;
        const d2 = dLat * dLat + dLng * dLng;
        if (d2 < 1e-6) {
          exact = p.temp;
          break;
        }
        const weight = 1 / Math.pow(d2, halfPow);
        num += weight * p.temp;
        den += weight;
      }
      out[y * w + x] = Number.isNaN(exact) ? (den > 0 ? num / den : 0) : exact;
    }
  }
  return out;
}

/** Render the interpolated field to an RGBA byte buffer (row-major, row 0 = north). */
export function buildRGBA(points: FieldPoint[], w: number, h: number, alpha = 215, power = 2, rowLat?: Float64Array): Uint8Array {
  const temps = interpolateField(points, w, h, power, rowLat);
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < temps.length; i++) {
    const [r, g, b] = colorRamp(temps[i]);
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = alpha;
  }
  return rgba;
}

export type Domain = 'land' | 'ocean';

/** Single-channel alpha for a domain from a land bitmask (1 = land): `a` in-domain, 0 out. */
export function domainAlpha(mask: Uint8Array, domain: Domain, a = 235): Uint8Array {
  const out = new Uint8Array(mask.length);
  const wantLand = domain === 'land';
  for (let i = 0; i < mask.length; i++) out[i] = (mask[i] === 1) === wantLand ? a : 0;
  return out;
}

/**
 * Render a domain-clipped field: interpolate from `points` (already filtered to the
 * domain) but paint only the matching pixels per `mask` (1 = land). Off-domain pixels
 * are transparent, so the coastline is a hard, clean clip with no cross-blending.
 */
export function buildRGBADomain(
  points: FieldPoint[],
  w: number,
  h: number,
  mask: Uint8Array,
  domain: Domain,
  alpha = 235,
  power = 2,
): Uint8Array {
  const temps = interpolateField(points, w, h, power);
  const rgba = new Uint8Array(w * h * 4);
  const wantLand = domain === 'land';
  for (let i = 0; i < temps.length; i++) {
    const o = i * 4;
    if ((mask[i] === 1) !== wantLand) {
      rgba[o + 3] = 0; // outside this domain → transparent
      continue;
    }
    const [r, g, b] = colorRamp(temps[i]);
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = alpha;
  }
  return rgba;
}
