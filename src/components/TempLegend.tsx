'use client';

import { motion } from 'framer-motion';

/**
 * OSIRIS — temperature colorbar legend.
 *
 * Shows the −2…32 °C scale used by all temperature layers (NOAA ERDDAP BlueWhiteRed),
 * so any color on the map is readable. The gradient stops mirror the server RAMP in
 * api/temperature/field/render.ts exactly. Rendered only while a temperature layer is
 * active. A one-line hint points to the existing right-click point readout.
 */

// (temp °C, css color) — identical stops to the server RAMP; positions = (t+2)/42.
const STOPS: [number, string][] = [
  [-2, 'rgb(0,0,110)'],
  [1, 'rgb(0,0,137)'],
  [4, 'rgb(0,0,191)'],
  [7, 'rgb(0,32,236)'],
  [10, 'rgb(0,111,255)'],
  [13, 'rgb(19,213,255)'],
  [16, 'rgb(92,249,255)'],
  [19, 'rgb(209,255,255)'],
  [22, 'rgb(255,255,183)'],
  [25, 'rgb(255,243,78)'],
  [28, 'rgb(255,203,0)'],
  [31, 'rgb(255,91,0)'],
  [34, 'rgb(227,23,0)'],
  [37, 'rgb(181,0,0)'],
  [40, 'rgb(140,0,0)'],
];

const MIN = -2;
const MAX = 40;
const pct = (t: number) => ((t - MIN) / (MAX - MIN)) * 100;
const gradient = `linear-gradient(to right, ${STOPS.map(([t, c]) => `${c} ${pct(t).toFixed(1)}%`).join(', ')})`;
const TICKS = [0, 10, 20, 30, 40];

export default function TempLegend({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
      className="glass-panel px-3 py-2 pointer-events-auto select-none"
      style={{ width: 220 }}
    >
      <div className="hud-label mb-1">TEMPERATURE · °C</div>
      <div
        className="w-full rounded-sm"
        style={{ height: 10, background: gradient, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
      />
      <div className="relative mt-1 h-3">
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute text-[8px] font-mono text-[var(--text-muted)] -translate-x-1/2"
            style={{ left: `${pct(t)}%` }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[8px] font-mono tracking-wide text-[var(--text-muted)]">
        Right-click the map for a point reading
      </div>
    </motion.div>
  );
}
