'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, Satellite, Activity, Sun, AlertTriangle, Camera, Flame, Target,
  CloudLightning, Radiation, Tv, Anchor, Ship, Newspaper,
  Network, Share2, Radio, Mountain, ShieldAlert, Globe, Eye, BookMarked, Thermometer, Waves
} from 'lucide-react';

interface LayerPanelProps {
  data: any;
  activeLayers: any;
  setActiveLayers: React.Dispatch<React.SetStateAction<any>>;
  isMobile?: boolean;
  theme?: 'core' | 'ghost';
  setTheme?: (theme: 'core' | 'ghost') => void;
}

const getLayerGroups = (theme: 'core' | 'ghost') => {
  const isGhost = theme === 'ghost';
  const phantomPurple = '#B388FF';
  const ghostPriv = '#CE93D8';
  const ghostGov = '#D500F9';

  const flightCom = isGhost ? phantomPurple : '#1A73E8';
  const flightPriv = isGhost ? ghostPriv : '#FFD700';
  const flightGov = isGhost ? ghostGov : '#FF9500';
  const flightMil = '#FF0000';

  return [
  {
    label: 'AVIATION',
    fullLabel: 'AVIATION',
    color: flightCom,
    layers: [
      { key: 'flights', label: 'Commercial', icon: Plane, color: flightCom, dataKey: 'commercial_flights' },
      { key: 'private', label: 'Private', icon: Plane, color: flightPriv, dataKey: 'private_flights' },
      { key: 'jets', label: 'Private Jets', icon: Plane, color: flightGov, dataKey: 'private_jets' },
      { key: 'military', label: 'Military', icon: Shield, color: flightMil, dataKey: 'military_flights' },
    ],
  },
  {
    label: 'MARITIME',
    fullLabel: 'MARITIME & SPACE',
    color: '#26C6DA',
    layers: [
      { key: 'maritime', label: 'Maritime / Naval', icon: Ship, color: '#26C6DA', dataKey: 'maritime_ships,maritime_ports,maritime_chokepoints' },
      { key: 'cables', label: 'Submarine Cables', icon: Anchor, color: '#1976D2', dataKey: 'submarine_cables' },
      { key: 'satellites', label: 'Satellites', icon: Satellite, color: '#1A73E8', dataKey: 'satellites' },
    ],
  },
  {
    label: 'SURVEIL',
    fullLabel: 'SURVEILLANCE',
    color: '#7E57C2',
    layers: [
      { key: 'cctv', label: 'CCTV Cameras', icon: Camera, color: '#7E57C2', dataKey: 'cameras' },
      { key: 'live_news', label: 'Live News Feeds', icon: Tv, color: '#EC407A', dataKey: 'live_feeds' },
    ],
  },
  {
    label: 'HAZARD',
    fullLabel: 'NATURAL HAZARDS',
    color: '#F9A825',
    layers: [
      { key: 'earthquakes', label: 'Earthquakes (24h)', icon: Activity, color: '#F9A825', dataKey: 'earthquakes' },
      { key: 'fires', label: 'Active Fires', icon: Flame, color: '#E65100', dataKey: 'fires' },
      { key: 'weather', label: 'Severe Weather', icon: CloudLightning, color: '#7E57C2', dataKey: 'weather_events' },
      { key: 'temperature_sea', label: 'Sea Temp · Open-Meteo', icon: Waves, color: '#26C6DA', dataKey: '' },
      { key: 'temperature_sea_oisst', label: 'Sea Temp · NOAA OISST', icon: Waves, color: '#0288D1', dataKey: '' },
      { key: 'temperature_land', label: 'Land Temp · Open-Meteo', icon: Thermometer, color: '#FF7043', dataKey: '' },
      { key: 'buoy_temps', label: 'Buoy Temps · NOAA NDBC', icon: Anchor, color: '#26C6DA', dataKey: 'buoys' },
    ],
  },
  {
    label: 'THREAT',
    fullLabel: 'THREATS & INFRA',
    color: '#D32F2F',
    layers: [
      { key: 'infrastructure', label: 'Nuclear Facilities', icon: Radiation, color: '#26A69A', dataKey: 'infrastructure' },
      { key: 'power_plants', label: 'Power Plants', icon: Activity, color: '#26A69A', dataKey: 'power_plants' },
      { key: 'global_incidents', label: 'Global Incidents', icon: AlertTriangle, color: '#D32F2F', dataKey: 'gdelt' },
      { key: 'gps_jamming', label: 'GPS Jamming', icon: Radio, color: '#D32F2F', dataKey: 'gps_jamming' },
      { key: 'ransomware', label: 'Ransomware Victims', icon: AlertTriangle, color: '#D32F2F', dataKey: 'ransomware' },
      { key: 'eurepoc', label: 'Cyber Incidents (EuRepoC)', icon: ShieldAlert, color: '#C2185B', dataKey: 'eurepoc' },
    ],
  },
  {
    label: 'NETWORK',
    fullLabel: 'NETWORK INTEL',
    color: '#D32F2F',
    layers: [

      { key: 'malware', label: 'Live Malware', icon: AlertTriangle, color: '#D32F2F', dataKey: 'malware_threats' },
      { key: 'blocklist', label: 'Blocklisted IPs', icon: AlertTriangle, color: '#FF6D00', dataKey: 'threat_intel', countTypes: ['abuseipdb', 'blocklist_de'] },
      { key: 'phishing', label: 'Phishing Sites', icon: Target, color: '#AA00FF', dataKey: 'threat_intel', countTypes: ['phishing'] },
      { key: 'ssl_blacklist', label: 'SSL Blacklist', icon: AlertTriangle, color: '#FF1744', dataKey: 'threat_intel', countTypes: ['ssl_blacklist'] },
    ],
  },
  {
    label: 'CYBER INTEL',
    fullLabel: 'CYBER THREAT INTELLIGENCE',
    color: '#1A73E8',
    layers: [
      { key: 'cve_feed', label: 'Active CVE Threats', icon: ShieldAlert, color: '#1A73E8', dataKey: 'cyber_intel' },
      { key: 'bgp_routes', label: 'Routing Intel (DROP)', icon: Globe, color: '#FF9100', dataKey: 'cyber_intel' },
      { key: 'tor_nodes', label: 'Tor Exit Nodes', icon: Eye, color: '#6D28D9', dataKey: 'cyber_intel' },
      { key: 'mitre_attack', label: 'MITRE ATT&CK', icon: BookMarked, color: '#00E676', dataKey: 'cyber_intel' },
    ],
  },
  {
    label: 'DISPLAY',
    fullLabel: 'DISPLAY',
    color: '#448AFF',
    layers: [
      { key: 'day_night', label: 'Day / Night Cycle', icon: Sun, color: '#448AFF', dataKey: '' },
      { key: 'terrain_3d', label: '3D Terrain & Buildings', icon: Mountain, color: '#8D6E63', dataKey: '' },
    ],
  },
  ];
};

// SVG component for Shield which was missing in the imports above
function Shield(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function LayerPanel({ data, activeLayers, setActiveLayers, isMobile, theme = 'core', setTheme }: LayerPanelProps) {
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const LAYER_GROUPS = getLayerGroups(theme);
  const ALL_LAYERS = LAYER_GROUPS.flatMap(g => g.layers);

  const toggle = (key: string) => setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  
  const getCount = (layer: any): number | null => {
    const dk: string = layer?.dataKey;
    if (!dk) return null;
    let total = 0;
    let found = false;
    for (const k of dk.split(',')) {
      if (data[k] && Array.isArray(data[k])) {
        found = true;
        // Layers sharing a dataKey (blocklist/phishing/ssl_blacklist all read
        // threat_intel) count only the rows matching their own threat_type.
        total += layer.countTypes
          ? data[k].filter((t: any) => layer.countTypes.includes(t.threat_type)).length
          : data[k].length;
      }
    }
    return found ? total : null;
  };

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4 py-2">
        {LAYER_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <div 
              className="text-[10px] font-bold font-mono tracking-widest border-b border-[var(--border-primary)] pb-1.5"
              style={{ color: 'var(--text-heading)' }}
            >
              {group.fullLabel}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.layers.map((layer) => {
                const isLayerActive = activeLayers[layer.key];
                const count = getCount(layer);
                
                return (
                  <button
                    key={layer.key}
                    onClick={() => toggle(layer.key)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                      isLayerActive
                        ? 'bg-[var(--hover-accent)] border-[var(--border-active)]'
                        : 'bg-transparent border-[var(--border-secondary)] hover:border-[var(--border-primary)]'
                    }`}
                  >
                    <div 
                      className={`w-2 h-2 rounded-full border flex-shrink-0 transition-all ${
                        isLayerActive ? 'bg-current border-current scale-100' : 'bg-transparent border-[var(--text-muted)] scale-75'
                      }`}
                      style={{ color: isLayerActive ? layer.color : 'var(--text-muted)', boxShadow: isLayerActive ? `0 0 8px ${layer.color}` : 'none' }}
                    />
                    <span className={`text-[9px] font-mono uppercase tracking-wider flex-1 text-left ${isLayerActive ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                      {layer.label}
                    </span>
                    {count !== null && (
                      <span className="text-[8px] font-mono tabular-nums opacity-60">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* MOBILE THEME TOGGLE */}
        {setTheme && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-primary)] px-2">
            <div className="text-[10px] font-bold font-mono tracking-widest text-[var(--text-secondary)]">
              GHOST MODE
            </div>
            <button
              onClick={() => setTheme(theme === 'core' ? 'ghost' : 'core')}
              className="relative w-12 h-6 rounded-full transition-all duration-500 ease-in-out border flex items-center px-0.5 cursor-pointer hover:shadow-lg"
              style={{
                backgroundColor: theme === 'ghost' ? 'rgba(179, 136, 255, 0.15)' : 'rgba(60,64,67,0.08)',
                borderColor: theme === 'ghost' ? 'rgba(179, 136, 255, 0.5)' : 'var(--border-primary)',
                boxShadow: theme === 'ghost' ? '0 0 15px rgba(179, 136, 255, 0.3), inset 0 0 8px rgba(179, 136, 255, 0.2)' : 'none'
              }}
            >
              <motion.div 
                layout
                className="w-4 h-4 rounded-full"
                style={{
                  backgroundColor: theme === 'ghost' ? '#B388FF' : 'var(--text-muted)',
                  boxShadow: theme === 'ghost' ? '0 0 10px #B388FF' : 'none'
                }}
                animate={{ x: theme === 'ghost' ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        )}

      </div>
    );
  }

  return (
    <motion.div 
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 left-0 h-full w-[80px] border-r border-[var(--border-primary)] flex flex-col pt-32 pb-8 z-50 pointer-events-auto bg-[var(--bg-panel)] backdrop-blur-[24px] saturate-150"
      style={{ boxShadow: '1px 0 6px rgba(60,64,67,0.15)' }}
    >
      
      <div className="flex-1 flex flex-col gap-6 px-2">
        {LAYER_GROUPS.map((group) => {
          const groupActiveCount = group.layers.filter(l => activeLayers[l.key]).length;
          const isActive = groupActiveCount > 0;
          const isHovered = hoveredGroup === group.label;

          return (
            <div 
              key={group.label} 
              className="relative flex justify-center items-center"
              onMouseEnter={() => setHoveredGroup(group.label)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {/* The Vertical Label */}
              <div 
                className={`text-[10px] font-mono font-bold cursor-pointer select-none transition-all duration-300 flex items-center justify-center`}
                style={{
                  writingMode: 'horizontal-tb',
                  color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  opacity: isActive || isHovered ? 1 : 0.8,
                }}
              >
                {/* Active Indicator dot */}
                {isActive && (
                  <div 
                    className="absolute -left-1 w-1 h-1 rounded-full animate-pulse"
                    style={{ backgroundColor: group.color, boxShadow: `0 0 8px ${group.color}` }}
                  />
                )}
                {group.label}
              </div>

              {/* Slide-out Menu */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -5, filter: 'blur(2px)' }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute left-[70px] top-1/2 -translate-y-1/2 min-w-[244px] bg-[var(--bg-panel-solid)] backdrop-blur-md border border-[var(--border-primary)] rounded-xl p-3 z-50 pointer-events-auto"
                    style={{
                      boxShadow: '0 1px 3px rgba(60,64,67,0.2), 0 4px 16px rgba(60,64,67,0.15)'
                    }}
                  >
                    <div className="text-[11px] font-bold font-mono mb-2.5 tracking-widest border-b border-[var(--border-primary)] pb-2 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      {group.fullLabel}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {group.layers.map((layer) => {
                        const isLayerActive = activeLayers[layer.key];
                        const count = getCount(layer);
                        const Icon = layer.icon || Shield;
                        
                        return (
                          <button
                            key={layer.key}
                            onClick={() => toggle(layer.key)}
                            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg bg-transparent hover:bg-[var(--bg-tertiary)] transition-colors group"
                          >
                            <div
                              className={`w-2 h-2 rounded-full border flex-shrink-0 transition-all duration-300 ${isLayerActive ? 'bg-current border-current scale-100' : 'bg-transparent border-[var(--text-muted)] scale-75'}`}
                              style={{ color: isLayerActive ? layer.color : 'var(--text-muted)', boxShadow: isLayerActive ? `0 0 8px ${layer.color}` : 'none' }}
                            />
                            <span className={`text-[11px] font-mono uppercase tracking-wider flex-1 text-left transition-colors duration-200 ${isLayerActive ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                              {layer.label}
                            </span>
                            {count !== null && (
                              <span className="text-[9px] font-mono tabular-nums opacity-60">
                                {count.toLocaleString()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* DESKTOP THEME TOGGLE */}
      {setTheme && (
        <div className="mt-auto px-2 pt-6 pb-2 border-t border-[var(--border-primary)] flex flex-col items-center gap-3 relative z-50">
          <div className="text-[9px] font-mono tracking-[0.25em] text-[var(--text-secondary)]">GHOST PROTOCOL</div>
          <button
            onClick={() => setTheme(theme === 'core' ? 'ghost' : 'core')}
            className="relative w-14 h-7 rounded-full transition-all duration-500 ease-in-out border flex items-center px-1 cursor-pointer hover:shadow-lg"
            style={{
              backgroundColor: theme === 'ghost' ? 'rgba(179, 136, 255, 0.15)' : 'rgba(0,0,0,0.4)',
              borderColor: theme === 'ghost' ? 'rgba(179, 136, 255, 0.5)' : 'rgba(255,255,255,0.1)',
              boxShadow: theme === 'ghost' ? '0 0 15px rgba(179, 136, 255, 0.3), inset 0 0 8px rgba(179, 136, 255, 0.2)' : 'inset 0 0 5px rgba(0,0,0,0.5)'
            }}
          >
            <motion.div 
              layout
              className="w-5 h-5 rounded-full"
              style={{
                backgroundColor: theme === 'ghost' ? '#B388FF' : 'var(--text-muted)',
                boxShadow: theme === 'ghost' ? '0 0 10px #B388FF' : 'none'
              }}
              animate={{ x: theme === 'ghost' ? 28 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      )}

    </motion.div>
  );
}

export default memo(LayerPanel);
