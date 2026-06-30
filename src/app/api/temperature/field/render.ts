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

// Color ramp stops: temperature °C → RGB. Cold (blue/purple) → hot (red).
const RAMP: [number, [number, number, number]][] = [
  [-40, [12, 12, 80]],
  [-25, [49, 54, 149]],
  [-12, [69, 117, 180]],
  [-2, [116, 173, 209]],
  [6, [171, 217, 233]],
  [14, [224, 243, 248]],
  [20, [255, 255, 191]],
  [26, [254, 224, 144]],
  [32, [253, 174, 97]],
  [38, [244, 109, 67]],
  [45, [215, 48, 39]],
  [52, [140, 20, 30]],
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
export function interpolateField(points: FieldPoint[], w: number, h: number, power = 2): Float32Array {
  const out = new Float32Array(w * h);
  const halfPow = power / 2;
  for (let y = 0; y < h; y++) {
    const lat = LAT_TOP - ((y + 0.5) / h) * (LAT_TOP - LAT_BOT);
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
export function buildRGBA(points: FieldPoint[], w: number, h: number, alpha = 215, power = 2): Uint8Array {
  const temps = interpolateField(points, w, h, power);
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
  alpha = 215,
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
