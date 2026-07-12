'use client';

import { motion } from 'framer-motion';
import { MARKER_ICON_SVG, VESSEL_TYPES, VESSEL_FALLBACK } from './mapMarkers';

/**
 * OSIRIS — live AIS vessel type legend.
 *
 * Shows the vessel-type colour/icon key used by the maritime ships layer so
 * users can read traffic at a glance (e.g. tankers converging on Hormuz vs
 * container ships heading to Rotterdam). Rendered only while the maritime
 * layer is active and live ships are on screen. Colours/icons come from the
 * shared VESSEL_TYPES palette in mapMarkers, so map and legend never drift.
 */

const ROWS = [...VESSEL_TYPES, { value: 'other', ...VESSEL_FALLBACK }];

export default function VesselLegend({ active, shipCount }: { active: boolean; shipCount: number }) {
  if (!active || shipCount === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
      className="glass-panel px-3 py-2 pointer-events-auto select-none"
      style={{ width: 220 }}
    >
      <div className="hud-label mb-1">LIVE VESSELS · {shipCount.toLocaleString()} AIS</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {ROWS.map(({ value, label, icon, color }) => (
          <div key={value} className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              width={13}
              height={13}
              fill="none"
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
              dangerouslySetInnerHTML={{ __html: MARKER_ICON_SVG[icon] }}
            />
            <span className="text-[9px] font-mono tracking-wide" style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[8px] font-mono tracking-wide text-[var(--text-muted)]">
        Click a vessel for name · destination · ETA · IMO
      </div>
    </motion.div>
  );
}
