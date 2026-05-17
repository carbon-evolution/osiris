'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Plane, Satellite, Activity, Globe, Radio, Eye,
  Shield, Sun, AlertTriangle, Camera, Flame, Target,
  CloudLightning, Radiation, Tv, Anchor, Ship,
} from 'lucide-react';

interface LayerPanelProps {
  data: any;
  activeLayers: any;
  setActiveLayers: React.Dispatch<React.SetStateAction<any>>;
}

const LAYER_CONFIG = [
  { key: 'flights', label: 'Commercial Flights', icon: Plane, color: '#00E5FF', dataKey: 'commercial_flights' },
  { key: 'private', label: 'Private Aircraft', icon: Plane, color: '#00E676', dataKey: 'private_flights' },
  { key: 'jets', label: 'Private Jets', icon: Plane, color: '#FF69B4', dataKey: 'private_jets' },
  { key: 'military', label: 'Military Flights', icon: Shield, color: '#FF3D3D', dataKey: 'military_flights' },
  { key: 'maritime', label: 'Maritime / Naval', icon: Ship, color: '#00BCD4', dataKey: 'maritime_ships' },
  { key: 'satellites', label: 'Satellites', icon: Satellite, color: '#D4AF37', dataKey: 'satellites' },
  { key: 'balloons', label: 'Balloons / Sondes', icon: Globe, color: '#FFCA28', dataKey: 'balloons' },
  { key: 'cctv', label: 'CCTV Cameras', icon: Camera, color: '#39FF14', dataKey: 'cameras' },
  { key: 'live_news', label: 'Live News Feeds', icon: Tv, color: '#FF4081', dataKey: 'live_feeds' },
  { key: 'earthquakes', label: 'Earthquakes (24h)', icon: Activity, color: '#FF9500', dataKey: 'earthquakes' },
  { key: 'fires', label: 'Active Fires', icon: Flame, color: '#FF6B00', dataKey: 'fires' },
  { key: 'weather', label: 'Severe Weather', icon: CloudLightning, color: '#E040FB', dataKey: 'weather_events' },
  { key: 'radiation', label: 'Radiation Monitoring', icon: Radiation, color: '#AB47BC', dataKey: 'radiation' },
  { key: 'infrastructure', label: 'Nuclear Facilities', icon: Radiation, color: '#76FF03', dataKey: 'infrastructure' },
  { key: 'global_incidents', label: 'Global Incidents', icon: AlertTriangle, color: '#FF3D3D', dataKey: 'gdelt' },
  { key: 'war_alerts', label: 'Global Conflicts (Simulated)', icon: Target, color: '#FF1744', dataKey: 'war_alerts' },
  { key: 'gps_jamming', label: 'GPS Jamming', icon: Radio, color: '#FF4444', dataKey: 'gps_jamming' },
  { key: 'day_night', label: 'Day / Night Cycle', icon: Sun, color: '#448AFF', dataKey: null },
];

function LayerPanel({ data, activeLayers, setActiveLayers }: LayerPanelProps) {
  const toggle = (key: string) => setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  const getCount = (dk: string | null): number | null => {
    if (!dk || !data[dk]) return null;
    return Array.isArray(data[dk]) ? data[dk].length : null;
  };
  const totalEntities = LAYER_CONFIG.reduce((s, l) => s + (getCount(l.dataKey) || 0), 0);
  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="glass-panel p-3 pointer-events-auto">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="hud-text text-[14px] text-[var(--text-primary)]">DATA LAYERS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{activeCount}/{LAYER_CONFIG.length} ACTIVE · {totalEntities.toLocaleString()} ENTITIES</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
        </div>
      </div>
      <div className="space-y-0.5">
        {LAYER_CONFIG.map((layer) => {
          const Icon = layer.icon;
          const isActive = activeLayers[layer.key];
          const count = getCount(layer.dataKey);
          return (
            <button key={layer.key} onClick={() => toggle(layer.key)} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 ${isActive ? 'bg-[var(--hover-accent)] border border-[var(--border-primary)]' : 'border border-transparent hover:bg-[var(--hover-accent)]'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? layer.color : 'var(--text-muted)' }} />
              <span className={`text-[12px] font-mono tracking-wider flex-1 text-left ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{layer.label}</span>
              {count !== null && <span className="text-[10px] font-mono tabular-nums" style={{ color: isActive ? layer.color : 'var(--text-muted)' }}>{count.toLocaleString()}</span>}
              <div className={`layer-toggle ${isActive ? 'active' : ''}`} />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export default memo(LayerPanel);
