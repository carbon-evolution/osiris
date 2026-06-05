'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  X, Maximize2, Minimize2, Loader2, AlertTriangle,
  Plane, Ship, Building2, User, Globe, Newspaper, ShieldAlert,
  RefreshCw, Network
} from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// ── TYPES ──

interface EntityNode {
  id: string;
  label: string;
  type: 'aircraft' | 'vessel' | 'company' | 'person' | 'country' | 'event' | 'sanction';
  properties?: Record<string, any>;
  x?: number; y?: number;
}

interface EntityLink {
  source: string | EntityNode;
  target: string | EntityNode;
  label: string;
}

interface GraphData { nodes: EntityNode[]; links: EntityLink[]; }

// ── PALETTE ──

const TYPE_COLORS: Record<string, string> = {
  aircraft: '#00E5FF', vessel: '#00BCD4', company: '#D4AF37',
  person: '#FF69B4', country: '#76FF03', event: '#FF9500', sanction: '#FF1744',
};

const TYPE_ICONS: Record<string, typeof Plane> = {
  aircraft: Plane, vessel: Ship, company: Building2,
  person: User, country: Globe, event: Newspaper, sanction: ShieldAlert,
};

// ── PROPS ──

interface Props {
  entity: { type: string; id: string; label?: string; properties?: Record<string, any> } | null;
  onClose: () => void;
}

function EntityGraphPanel({ entity, onClose }: Props) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<EntityNode | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const mergeGraph = useCallback((existing: GraphData, incoming: GraphData): GraphData => {
    const nodeMap = new Map<string, EntityNode>();
    for (const n of existing.nodes) nodeMap.set(n.id, n);
    for (const n of incoming.nodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
    const linkSet = new Set(existing.links.map(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return `${s}→${t}→${l.label}`;
    }));
    const merged = [...existing.links];
    for (const l of incoming.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      const k = `${s}→${t}→${l.label}`;
      if (!linkSet.has(k)) { linkSet.add(k); merged.push(l); }
    }
    return { nodes: Array.from(nodeMap.values()), links: merged };
  }, []);

  const expandEntity = useCallback(async (type: string, id: string, properties?: Record<string, any>) => {
    const key = `${type}:${id}`;
    if (expandedIds.has(key)) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ type, id });
      // Forward extra properties for aircraft/vessel resolution
      if (properties?.registration) params.set('registration', properties.registration);
      if (properties?.model) params.set('model', properties.model);
      if (properties?.icao24) params.set('icao24', properties.icao24);
      const res = await fetch(`/api/entity/expand?${params}`, { cache: 'no-store' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setGraphData(prev => mergeGraph(prev, { nodes: data.nodes || [], links: data.links || [] }));
      setExpandedIds(prev => new Set([...prev, key]));
    } catch (e) { setError(e instanceof Error ? e.message : 'Expansion failed'); }
    finally { setLoading(false); }
  }, [expandedIds, mergeGraph]);

  useEffect(() => {
    if (!entity) return;
    const root: EntityNode = {
      id: `${entity.type}:${entity.id}`, label: entity.label || entity.id,
      type: entity.type as EntityNode['type'], properties: entity.properties,
    };
    setGraphData({ nodes: [root], links: [] });
    setExpandedIds(new Set());
    setSelectedNode(root);
    setError(null);
    expandEntity(entity.type, entity.id, entity.properties);
  }, [entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = useCallback((node: any) => {
    const n = node as EntityNode;
    setSelectedNode(n);
    const rawId = n.id.includes(':') ? n.id.split(':').slice(1).join(':') : n.id;
    if (!expandedIds.has(`${n.type}:${rawId}`)) expandEntity(n.type, rawId);
  }, [expandedIds, expandEntity]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as EntityNode;
    const size = n === selectedNode ? 8 : 6;
    const color = TYPE_COLORS[n.type] || '#888';
    const fontSize = Math.max(10 / globalScale, 1.5);
    ctx.beginPath(); ctx.arc(node.x!, node.y!, size + 3, 0, 2 * Math.PI);
    ctx.fillStyle = `${color}30`; ctx.fill();
    ctx.beginPath(); ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = n === selectedNode ? '#fff' : `${color}80`;
    ctx.lineWidth = n === selectedNode ? 2 : 1; ctx.stroke();
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#E8E6E0'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label, node.x!, node.y! + size + 3);
  }, [selectedNode]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { source: s, target: t } = link;
    if (!s.x || !t.x) return;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = 'rgba(212,175,55,0.15)'; ctx.lineWidth = 1; ctx.stroke();
    const fs = Math.max(8 / globalScale, 1);
    if (fs > 1.5) {
      ctx.font = `${fs}px 'JetBrains Mono', monospace`; ctx.fillStyle = 'rgba(212,175,55,0.5)';
      ctx.textAlign = 'center'; ctx.fillText(link.label || '', (s.x + t.x) / 2, (s.y + t.y) / 2);
    }
  }, []);

  // Removed early return to allow rendering empty panel

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 500, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 500, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full z-[500] flex flex-col"
        style={{
          width: expanded ? '60vw' : '480px', maxWidth: '90vw',
          background: 'rgba(8,10,18,0.96)', backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(212,175,55,0.15)', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" style={{ boxShadow: '0 0 8px #D4AF37' }} />
            <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-[#D4AF37]">ENTITY GRAPH</span>
            {loading && <Loader2 className="w-3 h-3 text-[#00E5FF] animate-spin" />}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 hover:bg-white/5 rounded transition-colors">
              {expanded ? <Minimize2 className="w-3.5 h-3.5 text-white/50" /> : <Maximize2 className="w-3.5 h-3.5 text-white/50" />}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded transition-colors">
              <X className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </div>

        {/* ROOT LABEL */}
        {entity ? (
          <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
            {(() => { const I = TYPE_ICONS[entity.type] || Globe; return <I className="w-4 h-4" style={{ color: TYPE_COLORS[entity.type] }} />; })()}
            <span className="text-xs font-mono text-white/80 tracking-wider uppercase truncate">{entity.label || entity.id}</span>
            <span className="text-[9px] font-mono text-white/30 ml-auto">{graphData.nodes.length} nodes · {graphData.links.length} links</span>
          </div>
        ) : (
          <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
            <Network className="w-4 h-4 text-white/40" />
            <span className="text-xs font-mono text-white/40 tracking-wider uppercase truncate">SELECT AN ENTITY ON THE MAP TO BEGIN</span>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/20 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-[#FF1744]" />
            <span className="text-[10px] font-mono text-[#FF1744]">{error}</span>
          </div>
        )}

        {/* GRAPH */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ minHeight: 300 }}>
          {graphData.nodes.length > 0 && (
            <ForceGraph2D
              ref={graphRef} graphData={graphData} nodeId="id"
              nodeCanvasObject={paintNode} linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick} backgroundColor="rgba(0,0,0,0)"
              width={containerRef.current?.clientWidth || 480}
              height={containerRef.current?.clientHeight || 400}
              d3AlphaDecay={0.02} d3VelocityDecay={0.3} cooldownTicks={100}
              linkDirectionalParticles={1} linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => 'rgba(212,175,55,0.4)'}
            />
          )}
          {graphData.nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono text-white/30">No graph data yet</span>
            </div>
          )}
        </div>

        {/* SELECTED NODE */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              className="border-t border-white/10 px-4 py-3 max-h-[35%] overflow-y-auto"
              style={{ background: 'rgba(12,14,22,0.95)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {(() => { const I = TYPE_ICONS[selectedNode.type] || Globe; return <I className="w-4 h-4" style={{ color: TYPE_COLORS[selectedNode.type] }} />; })()}
                  <span className="text-xs font-mono font-bold text-white tracking-wider uppercase">{selectedNode.label}</span>
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border"
                  style={{ color: TYPE_COLORS[selectedNode.type], borderColor: `${TYPE_COLORS[selectedNode.type]}40`, background: `${TYPE_COLORS[selectedNode.type]}10` }}>
                  {selectedNode.type.toUpperCase()}
                </span>
              </div>
              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                  {Object.entries(selectedNode.properties).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-[8px] font-mono text-white/30 uppercase tracking-wider">{k.replace(/_/g, ' ')}</span>
                      <div className="text-[10px] font-mono text-white/80 truncate">
                        {typeof v === 'boolean' ? (v ? '✅ YES' : '❌ NO') : String(v || '—')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!expandedIds.has(`${selectedNode.type}:${selectedNode.id.includes(':') ? selectedNode.id.split(':').slice(1).join(':') : selectedNode.id}`) && (
                <button onClick={() => {
                  const rawId = selectedNode.id.includes(':') ? selectedNode.id.split(':').slice(1).join(':') : selectedNode.id;
                  expandEntity(selectedNode.type, rawId);
                }} className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded border border-[#D4AF37]/30 bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-colors" disabled={loading}>
                  {loading ? <Loader2 className="w-3 h-3 text-[#D4AF37] animate-spin" /> : <RefreshCw className="w-3 h-3 text-[#D4AF37]" />}
                  <span className="text-[10px] font-mono font-bold text-[#D4AF37] tracking-wider">EXPAND ENTITY</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* LEGEND */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 flex-wrap">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <div key={t} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[8px] font-mono text-white/40 uppercase">{t}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(EntityGraphPanel);
