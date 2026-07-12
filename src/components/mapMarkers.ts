/**
 * Map marker icons — per-layer lucide glyphs rendered to canvas images for
 * MapLibre symbol layers, plus a deconflicted colour per layer.
 *
 * Each point layer keeps its glow-halo circle and gets a tinted icon on top.
 * Layers without a fitting icon fall back to their existing coloured dot
 * (they simply aren't listed here). Colours are chosen so no two layers share
 * the same hue; the icon shape is the primary cue and colour the secondary.
 *
 * Icon paths are the verbatim inner SVG of lucide-react icons (24×24 viewBox,
 * stroke-based), so map markers match the icons used in the layer panel.
 */

export type IconKey =
  | 'camera' | 'activity' | 'flame' | 'cloud-lightning' | 'radiation' | 'zap'
  | 'triangle-alert' | 'lock' | 'bug' | 'fish' | 'shield-off' | 'ban'
  | 'shield-alert' | 'eye' | 'crosshair' | 'tv' | 'ship' | 'anchor'
  | 'globe' | 'radio-tower' | 'container' | 'fuel' | 'navigation';

/** Verbatim lucide inner SVG markup, keyed by icon name. */
export const MARKER_ICON_SVG: Record<IconKey, string> = {
  'camera': '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  'activity': '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  'flame': '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  'cloud-lightning': '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  'radiation': '<path d="M12 12h.01"/><path d="M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z"/><path d="M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z"/><path d="M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z"/>',
  'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'bug': '<path d="M12 20v-9"/><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/><path d="M14.12 3.88 16 2"/><path d="M21 21a4 4 0 0 0-3.81-4"/><path d="M21 5a4 4 0 0 1-3.55 3.97"/><path d="M22 13h-4"/><path d="M3 21a4 4 0 0 1 3.81-4"/><path d="M3 5a4 4 0 0 0 3.55 3.97"/><path d="M6 13H2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/>',
  'fish': '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>',
  'shield-off': '<path d="m2 2 20 20"/><path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71"/><path d="M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"/>',
  'ban': '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
  'shield-alert': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'crosshair': '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  'tv': '<path d="m17 2-5 5-5-5"/><rect width="20" height="15" x="2" y="7" rx="2"/>',
  'ship': '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  'anchor': '<path d="M12 6v16"/><path d="m19 13 2-1a9 9 0 0 1-18 0l2 1"/><path d="M9 11h6"/><circle cx="12" cy="4" r="2"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'radio-tower': '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
  'container': '<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>',
  'fuel': '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  // Up-pointing arrow (tip due north at 0°) for vessel markers rotated by
  // heading, MarineTraffic-style. Symmetric so rotation reads cleanly.
  'navigation': '<path d="M12 2 L19 21 L12 16 L5 21 Z"/>',
};

/**
 * Vessel type palette — single source of truth shared by the ship marker
 * icons, the circle/label colours in OsirisMap, the click popup, and the
 * VesselLegend. "Container" is a size heuristic (cargo ≥ 150 m), see
 * api/maritime.
 */
export const VESSEL_TYPES: { value: string; label: string; icon: IconKey; color: string }[] = [
  { value: 'container', label: 'Container ship', icon: 'container', color: '#42A5F5' },
  { value: 'cargo', label: 'Cargo', icon: 'ship', color: '#26C6DA' },
  { value: 'tanker', label: 'Tanker', icon: 'fuel', color: '#FF9100' },
  { value: 'passenger', label: 'Passenger', icon: 'ship', color: '#66BB6A' },
  { value: 'military', label: 'Military', icon: 'ship', color: '#D32F2F' },
];
export const VESSEL_FALLBACK: { label: string; icon: IconKey; color: string } = {
  label: 'Other', icon: 'ship', color: '#B0BEC5',
};

/** Colour for a vessel type (popup + legend use this). */
export function vesselColor(type?: string): string {
  return VESSEL_TYPES.find((v) => v.value === type)?.color ?? VESSEL_FALLBACK.color;
}

/** A simple one-icon layer, or a data-driven layer that picks icon by property. */
export type MarkerLayer =
  | { source: string; icon: IconKey; color: string }
  | {
      source: string;
      property: string;
      cases: { value: string; icon: IconKey; color: string }[];
      fallback: { icon: IconKey; color: string };
    };

/**
 * Per-source marker configuration. Source names match the MapLibre sources in
 * OsirisMap. Colours are deconflicted across layers. Layers absent here (e.g.
 * maritime chokepoints) intentionally keep their coloured-dot fallback.
 */
export const MARKER_LAYERS: MarkerLayer[] = [
  { source: 'cctv', icon: 'camera', color: '#9575CD' },
  { source: 'earthquakes', icon: 'activity', color: '#F9A825' },
  { source: 'fires', icon: 'flame', color: '#FF6D00' },
  { source: 'weather', icon: 'cloud-lightning', color: '#7E57C2' },
  { source: 'infrastructure', icon: 'radiation', color: '#26A69A' },
  { source: 'power_plants', icon: 'zap', color: '#FDD835' },
  { source: 'gdelt', icon: 'triangle-alert', color: '#EF5350' },
  { source: 'ransomware', icon: 'lock', color: '#D32F2F' },
  { source: 'eurepoc', icon: 'shield-alert', color: '#C2185B' },
  { source: 'malware-nodes', icon: 'bug', color: '#D32F2F' },
  { source: 'cve-nodes', icon: 'shield-alert', color: '#00E5FF' },
  { source: 'drop-nodes', icon: 'globe', color: '#FF9100' },
  { source: 'tor-nodes', icon: 'eye', color: '#7C4DFF' },
  { source: 'mitre-nodes', icon: 'crosshair', color: '#00E676' },
  { source: 'live-news', icon: 'tv', color: '#F06292' },
  { source: 'maritime', icon: 'anchor', color: '#26C6DA' },
  {
    // Vessels render as directional arrows (rotated by heading in OsirisMap),
    // coloured by type — MarineTraffic-style. Per-type glyphs are kept in
    // VESSEL_TYPES for the legend; the map itself uses the 'navigation' arrow.
    source: 'maritime-ships',
    property: 'type',
    cases: VESSEL_TYPES.map(({ value, color }) => ({ value, icon: 'navigation' as IconKey, color })),
    fallback: { icon: 'navigation', color: VESSEL_FALLBACK.color },
  },
  { source: 'radiation', icon: 'radiation', color: '#9CCC65' },
  {
    source: 'threat-intel-nodes',
    property: 'threat_type',
    cases: [
      { value: 'blocklist_de', icon: 'ban', color: '#FF7043' },
      { value: 'ssl_blacklist', icon: 'shield-off', color: '#FF1744' },
      { value: 'phishing', icon: 'fish', color: '#D500F9' },
      { value: 'abuseipdb', icon: 'triangle-alert', color: '#FFCA28' },
    ],
    fallback: { icon: 'triangle-alert', color: '#FF7043' },
  },
];

/** Stable image id for a given icon + colour pairing. */
export function markerImageId(icon: IconKey, color: string): string {
  return `mk_${icon}_${color.replace('#', '')}`;
}

/** All (icon, color) pairs a layer needs registered as images. */
export function markerImages(m: MarkerLayer): { icon: IconKey; color: string }[] {
  if ('icon' in m) return [{ icon: m.icon, color: m.color }];
  return [...m.cases.map((c) => ({ icon: c.icon, color: c.color })), m.fallback];
}

/** The MapLibre `icon-image` value (a plain id, or a `match` expression). */
export function markerIconImage(m: MarkerLayer): unknown {
  if ('icon' in m) return markerImageId(m.icon, m.color);
  const match: unknown[] = ['match', ['get', m.property]];
  for (const c of m.cases) {
    match.push(c.value, markerImageId(c.icon, c.color));
  }
  match.push(markerImageId(m.fallback.icon, m.fallback.color));
  return match;
}

/**
 * Render a lucide glyph to an RGBA image for `map.addImage`. Draws a dark halo
 * pass then a coloured stroke pass so the icon stays legible on the bright glow
 * and the dark basemap. Browser-only (uses canvas + DOMParser).
 */
export function renderMarkerIcon(
  inner: string,
  color: string,
  size = 48,
): { width: number; height: number; data: Uint8Array } {
  const DPR = 2; // rasterize at 2× so glyphs stay crisp on Retina/HiDPI (caller adds with matching pixelRatio)
  const px = size * DPR;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const scale = px / 24; // lucide viewBox is 24×24, scaled up to the HiDPI canvas
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${inner}</svg>`,
    'image/svg+xml',
  );
  const els = Array.from(doc.documentElement.children);

  const strokeEl = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'path') {
      ctx.stroke(new Path2D(el.getAttribute('d') || ''));
      return;
    }
    ctx.beginPath();
    const num = (a: string) => parseFloat(el.getAttribute(a) || '0');
    if (tag === 'circle') {
      ctx.arc(num('cx'), num('cy'), num('r'), 0, Math.PI * 2);
    } else if (tag === 'ellipse') {
      ctx.ellipse(num('cx'), num('cy'), num('rx'), num('ry'), 0, 0, Math.PI * 2);
    } else if (tag === 'line') {
      ctx.moveTo(num('x1'), num('y1'));
      ctx.lineTo(num('x2'), num('y2'));
    } else if (tag === 'rect') {
      const x = num('x'), y = num('y'), w = num('width'), h = num('height'), rx = num('rx');
      if (rx && ctx.roundRect) ctx.roundRect(x, y, w, h, rx);
      else ctx.rect(x, y, w, h);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length >= 2) {
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        if (tag === 'polygon') ctx.closePath();
      }
    }
    ctx.stroke();
  };

  ctx.save();
  ctx.scale(scale, scale);
  // Dark halo pass for contrast on any background.
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 3.75;
  els.forEach(strokeEl);
  // Coloured glyph pass.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  els.forEach(strokeEl);
  ctx.restore();

  return { width: px, height: px, data: new Uint8Array(ctx.getImageData(0, 0, px, px).data) };
}

/** Zoom-interpolated icon size (icons are rendered at 48px). */
export const MARKER_ICON_SIZE: unknown = [
  'interpolate', ['linear'], ['zoom'],
  1, 0.28, 5, 0.36, 10, 0.45, 14, 0.55,
];
