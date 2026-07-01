/**
 * OSIRIS — equirectangular → Web-Mercator world reprojection.
 *
 * The temperature fields are rendered equirectangular (rows uniform in latitude,
 * ±LAT_TOP°). MapLibre's globe places `image` sources ambiguously, which pushed the
 * fields ~17° poleward. Serving the field instead as EPSG:3857 XYZ raster tiles goes
 * through MapLibre's native (correct) projection path — the same one NASA GIBS uses,
 * which registers perfectly on the globe. This turns the equirectangular raster into
 * a full Web-Mercator world square, from which the tile route crops power-of-two tiles.
 */

import { invMercatorLat, LAT_BOT, LAT_TOP } from './render';

const PI = Math.PI;

/**
 * Reproject an equirectangular RGBA raster — lng [-180,180), lat [LAT_TOP..LAT_BOT]
 * uniform in latitude — into a full Web-Mercator world square (`size`×`size`, lat
 * ±85.0511°, linear in mercator-Y). Rows outside the source's latitude band stay
 * transparent. Columns map 1:1 in longitude (both span the full ±180°).
 */
export function equirectToMercatorWorld(src: Buffer, srcW: number, srcH: number, size: number): Buffer {
  const out = Buffer.alloc(size * size * 4); // zero-filled → transparent
  const latSpan = LAT_TOP - LAT_BOT;
  for (let ty = 0; ty < size; ty++) {
    const v = (ty + 0.5) / size; // 0 (north/top) → 1 (south/bottom)
    const lat = invMercatorLat(PI - v * 2 * PI); // mercatorY π..-π → latitude
    if (lat > LAT_TOP || lat < LAT_BOT) continue; // beyond source band → transparent
    let sr = Math.floor(((LAT_TOP - lat) / latSpan) * srcH);
    if (sr < 0) sr = 0;
    else if (sr > srcH - 1) sr = srcH - 1;
    const srcRow = sr * srcW * 4;
    const outRow = ty * size * 4;
    for (let tx = 0; tx < size; tx++) {
      let sc = Math.floor(((tx + 0.5) / size) * srcW); // longitude 1:1
      if (sc > srcW - 1) sc = srcW - 1;
      const si = srcRow + sc * 4;
      const oi = outRow + tx * 4;
      out[oi] = src[si];
      out[oi + 1] = src[si + 1];
      out[oi + 2] = src[si + 2];
      out[oi + 3] = src[si + 3];
    }
  }
  return out;
}
