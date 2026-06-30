import { describe, expect, it } from 'vitest';
import { buildRGBA, colorRamp, interpolateField, lngDelta, type FieldPoint } from './render';

describe('colorRamp', () => {
  it('clamps below and above the ramp', () => {
    expect(colorRamp(-100)).toEqual([12, 12, 80]);
    expect(colorRamp(100)).toEqual([140, 20, 30]);
  });
  it('interpolates between stops', () => {
    const c = colorRamp(10); // between 6 and 14
    expect(c[0]).toBeGreaterThan(170);
    expect(c.every((v) => v >= 0 && v <= 255)).toBe(true);
  });
});

describe('lngDelta', () => {
  it('wraps across the antimeridian', () => {
    expect(lngDelta(179, -179)).toBeCloseTo(-2);
    expect(lngDelta(-179, 179)).toBeCloseTo(2);
    expect(lngDelta(10, 5)).toBeCloseTo(5);
  });
});

describe('interpolateField', () => {
  it('returns a value near a sole point everywhere', () => {
    const pts: FieldPoint[] = [{ lng: 0, lat: 0, temp: 25 }];
    const f = interpolateField(pts, 8, 4);
    for (const v of f) expect(v).toBeCloseTo(25);
  });
  it('blends between two points', () => {
    const pts: FieldPoint[] = [
      { lng: -90, lat: 0, temp: 0 },
      { lng: 90, lat: 0, temp: 30 },
    ];
    const f = interpolateField(pts, 8, 4);
    for (const v of f) {
      expect(v).toBeGreaterThanOrEqual(-0.01);
      expect(v).toBeLessThanOrEqual(30.01);
    }
  });
});

describe('buildRGBA', () => {
  it('produces a full RGBA buffer with the given alpha', () => {
    const buf = buildRGBA([{ lng: 0, lat: 0, temp: 20 }], 4, 2, 200);
    expect(buf.length).toBe(4 * 2 * 4);
    expect(buf[3]).toBe(200);
  });
});
