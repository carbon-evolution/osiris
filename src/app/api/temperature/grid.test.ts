import { describe, expect, it } from 'vitest';
import { buildGrid, chunk, classifyPoints, gibsTileUrl, LAT_LIMIT, utcDateString, type LandFC } from './grid';

// A crude "land" square covering Africa-ish (lng 0..40, lat 0..30) for classification tests.
const LAND: LandFC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]]],
      },
    },
  ],
};

describe('buildGrid', () => {
  it('respects bounds and step', () => {
    const g = buildGrid(10);
    for (const p of g) {
      expect(p.lat).toBeGreaterThanOrEqual(-LAT_LIMIT);
      expect(p.lat).toBeLessThanOrEqual(LAT_LIMIT);
      expect(p.lng).toBeGreaterThanOrEqual(-180);
      expect(p.lng).toBeLessThan(180);
    }
  });

  it('has the expected point count for a 10° grid', () => {
    // lat: -80..80 step 10 = 17 rows; lng: -180..170 step 10 = 36 cols
    expect(buildGrid(10).length).toBe(17 * 36);
  });

  it('rejects non-positive step', () => {
    expect(() => buildGrid(0)).toThrow();
  });
});

describe('classifyPoints', () => {
  it('marks a point inside the land polygon as land', () => {
    const [p] = classifyPoints([{ lat: 15, lng: 20 }], LAND);
    expect(p.kind).toBe('land');
  });

  it('marks a point outside the land polygon as ocean', () => {
    const [p] = classifyPoints([{ lat: 15, lng: 100 }], LAND);
    expect(p.kind).toBe('ocean');
  });
});

describe('chunk', () => {
  it('splits into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('gibsTileUrl', () => {
  it('produces an XYZ template with z/y/x placeholders', () => {
    const u = gibsTileUrl('GHRSST_L4_MUR_Sea_Surface_Temperature', '2026-06-30');
    expect(u).toContain('/2026-06-30/');
    expect(u).toContain('{z}/{y}/{x}.png');
  });
});

describe('utcDateString', () => {
  it('returns an ISO yyyy-mm-dd', () => {
    expect(utcDateString(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
