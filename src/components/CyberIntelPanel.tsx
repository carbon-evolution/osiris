'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Shield, ShieldAlert, ShieldOff, Globe,
  Eye, BookMarked, ExternalLink, AlertTriangle, TrendingUp, TrendingDown,
  Maximize2, Minimize2, Bug, Siren, Zap
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Cyber Threat Intelligence Panel
   CVEs, network intel, and MITRE ATT&CK in a dedicated slideout
   ═══════════════════════════════════════════════════════════════ */

interface CyberIntelPanelProps {
  data: any;
}

type IntelTab = 'cves' | 'kev' | 'network' | 'mitre';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#FF1744',
  HIGH: '#FF9100',
  MEDIUM: '#FFD740',
  LOW: '#00E676',
  UNKNOWN: '#888',
};

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] || '#888';
}

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

export default function CyberIntelPanel({ data }: CyberIntelPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<IntelTab>('kev');
  const [cyberIntel, setCyberIntel] = useState<any>(null);
  const [cyberThreats, setCyberThreats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Portal mount guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch cyber intel data
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [intelRes, threatsRes] = await Promise.allSettled([
          fetch('/api/cyber-intel'),
          fetch('/api/cyber-threats'),
        ]);
        if (cancelled) return;
        if (intelRes.status === 'fulfilled' && intelRes.value.ok) {
          setCyberIntel(await intelRes.value.json());
        }
        if (threatsRes.status === 'fulfilled' && threatsRes.value.ok) {
          setCyberThreats(await threatsRes.value.json());
        }
      } catch (e) {
        console.warn('[CyberIntelPanel] fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const iv = setInterval(fetchData, 300000); // 5 min
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const cves = cyberIntel?.cves || [];
  const spamhaus = cyberIntel?.spamhaus_drop || [];
  const torNodes = cyberIntel?.tor_exit_nodes || [];
  const mitreGroups = cyberIntel?.mitre_enrichment?.tactical_groups || [];
  const cisaThreats = cyberThreats?.threats || [];
  const threatLevel = cyberThreats?.stats?.threat_level || 'UNKNOWN';

  // Stats summary
  const totalCves = cves.length;
  const criticalCves = cves.filter((c: any) => c.severity === 'CRITICAL').length;
  const highCves = cves.filter((c: any) => c.severity === 'HIGH').length;

  const TABS: { key: IntelTab; label: string; icon: any; count: number }[] = [
    { key: 'kev', label: 'CISA KEV', icon: Siren, count: cisaThreats.length },
    { key: 'cves', label: 'CVEs', icon: Bug, count: totalCves },
    { key: 'network', label: 'NETWORK', icon: Globe, count: spamhaus.length + torNodes.length },
    { key: 'mitre', label: 'MITRE', icon: BookMarked, count: mitreGroups.length },
  ];

  const content = (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className={`glass-panel p-3 pointer-events-auto transition-all duration-300 flex flex-col ${
        maximized ? 'fixed inset-4 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : ''
      }`}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        role="button"
        tabIndex={0}
        className="flex items-center justify-between w-full mb-2 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-[#E040FB]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">CYBER INTEL</span>
          <span
            className="gotham-tag px-1.5 py-0.5 text-[7px] font-mono font-bold tracking-widest"
            style={{
              backgroundColor: `${severityColor(threatLevel)}20`,
              color: severityColor(threatLevel),
              border: `1px solid ${severityColor(threatLevel)}40`,
            }}
          >
            {threatLevel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
          <button
            onClick={(e) => { e.stopPropagation(); setMaximized(!maximized); if (!expanded && !maximized) setExpanded(true); }}
            className="hover:text-white transition-colors"
            title={maximized ? 'Restore' : 'Maximize'}
            type="button"
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
          {expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />}
        </div>
      </div>

      {/* Threat Level Indicator Bar */}
      <div
        className="h-[2px] rounded-full mb-2 transition-all duration-500"
        style={{
          backgroundColor: severityColor(threatLevel),
          boxShadow: `0 0 8px ${severityColor(threatLevel)}`,
          width: threatLevel === 'CRITICAL' ? '100%' : threatLevel === 'HIGH' ? '66%' : threatLevel === 'ELEVATED' ? '33%' : '10%',
        }}
      />
      <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest mb-2 block">
        {criticalCves} CRITICAL · {highCves} HIGH · {spamhaus.length} DROP BLOCKS · {torNodes.length} TOR EXITS
      </span>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[8px] font-mono font-bold tracking-wider transition-all ${
                isActive
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-2.5 h-2.5" />
              {tab.label}
              {tab.count > 0 && (
                <span className="tabular-nums opacity-70 ml-0.5">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-[380px] overflow-y-auto styled-scrollbar divide-y divide-[var(--border-secondary)]">
              {loading ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-4 h-4 border-2 border-[#E040FB] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span className="text-[9px] font-mono text-[var(--text-muted)] tracking-widest">LOADING THREAT INTEL...</span>
                </div>
              ) : (
                <>
                  {/* ── Tab: CISA KEV ── */}
                  {activeTab === 'kev' && (
                    <>
                      {cisaThreats.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <Shield className="w-5 h-5 text-[var(--alert-green)] mx-auto mb-1" />
                          <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest">NO ACTIVE CISA KEV ALERTS</span>
                        </div>
                      ) : (
                        cisaThreats.map((threat: any, i: number) => (
                          <div key={i} className="px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-mono font-bold text-[#FF1744] tracking-widest">KEV</span>
                              <span className="text-[8px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1 rounded">{threat.id}</span>
                              <span className="text-[8px] font-mono text-[var(--text-muted)] ml-auto">{threat.date ? timeAgo(threat.date) : ''}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-primary)] leading-tight mb-0.5">{threat.name}</div>
                            <div className="text-[8px] font-mono text-[var(--text-muted)]">
                              {threat.vendor} · {threat.product}
                            </div>
                            {threat.due && (
                              <div className="text-[7px] font-mono text-[#FF9100] mt-0.5">
                                DUE: {new Date(threat.due).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {/* ── Tab: CVEs ── */}
                  {activeTab === 'cves' && (
                    <>
                      {cves.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <Bug className="w-5 h-5 text-[var(--text-muted)] mx-auto mb-1" />
                          <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest">NO CVE DATA</span>
                        </div>
                      ) : (
                        cves.map((cve: any, i: number) => (
                          <div key={cve.id} className="px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: severityColor(cve.severity), boxShadow: `0 0 4px ${severityColor(cve.severity)}` }}
                              />
                              <span className="text-[9px] font-mono font-bold text-[var(--text-primary)]">{cve.id}</span>
                              <span
                                className="text-[8px] font-mono font-bold px-1 rounded"
                                style={{
                                  backgroundColor: `${severityColor(cve.severity)}20`,
                                  color: severityColor(cve.severity),
                                }}
                              >
                                {cve.cvss ? `CVSS ${cve.cvss}` : cve.severity}
                              </span>
                              {cve.vendors?.length > 0 && (
                                <span className="text-[7px] font-mono text-[var(--text-muted)] ml-auto">
                                  {cve.vendors.slice(0, 2).join(', ')}
                                </span>
                              )}
                            </div>
                            <div className="text-[8.5px] text-[var(--text-secondary)] leading-tight line-clamp-2">
                              {cve.summary}
                            </div>
                            {cve.cwe && (
                              <span className="text-[7px] font-mono text-[var(--text-muted)] mt-0.5 block">{cve.cwe}</span>
                            )}
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {/* ── Tab: NETWORK INTEL ── */}
                  {activeTab === 'network' && (
                    <>
                      {/* Spamhaus DROP */}
                      {spamhaus.length > 0 && (
                        <div className="px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <ShieldOff className="w-3 h-3 text-[#FF9100]" />
                            <span className="text-[9px] font-mono font-bold text-[#FF9100] tracking-widest">SPAMHAUS DROP ({spamhaus.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto styled-scrollbar">
                            {spamhaus.slice(0, 25).map((drop: any) => (
                              <span
                                key={drop.id}
                                className="px-1.5 py-0.5 rounded text-[7px] font-mono bg-[#FF9100]/10 text-[#FF9100]/80 border border-[#FF9100]/20"
                              >
                                {drop.cidr} {drop.country}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tor Exit Nodes */}
                      {torNodes.length > 0 && (
                        <div className="px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Eye className="w-3 h-3 text-[#7C4DFF]" />
                            <span className="text-[9px] font-mono font-bold text-[#7C4DFF] tracking-widest">TOR EXIT NODES ({torNodes.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto styled-scrollbar">
                            {torNodes.slice(0, 30).map((node: any) => (
                              <span
                                key={node.id}
                                className="px-1.5 py-0.5 rounded text-[7px] font-mono bg-[#7C4DFF]/10 text-[#7C4DFF]/80 border border-[#7C4DFF]/20"
                              >
                                {node.ip} {node.country}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {spamhaus.length === 0 && torNodes.length === 0 && (
                        <div className="px-4 py-6 text-center">
                          <Globe className="w-5 h-5 text-[var(--text-muted)] mx-auto mb-1" />
                          <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest">NO NETWORK INTEL DATA</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Tab: MITRE ATT&CK ── */}
                  {activeTab === 'mitre' && (
                    <>
                      {mitreGroups.length === 0 ? (
                        <div className="px-4 py-6 text-center">
                          <BookMarked className="w-5 h-5 text-[var(--text-muted)] mx-auto mb-1" />
                          <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest">NO MITRE DATA</span>
                        </div>
                      ) : (
                        mitreGroups.map((group: any, i: number) => (
                          <div key={group.id} className="px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px]">{group.country === 'RU' ? '🇷🇺' : group.country === 'KP' ? '🇰🇵' : group.country === 'CN' ? '🇨🇳' : group.country === 'IR' ? '🇮🇷' : '🏴'}</span>
                              <span className="text-[9px] font-mono font-bold text-[#00E676]">{group.name}</span>
                              <span className="text-[7px] font-mono text-[var(--text-muted)]">({group.id})</span>
                              <span className="text-[7px] font-mono text-[var(--text-muted)] ml-auto">{group.country}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(group.technique_names || group.techniques || []).slice(0, 3).map((t: string, ti: number) => (
                                <span
                                  key={ti}
                                  className="px-1 py-0.5 rounded text-[7px] font-mono bg-[#00E676]/10 text-[#00E676]/80 border border-[#00E676]/20"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer — timestamp */}
      {cyberIntel?.timestamp && (
        <div className="mt-1 pt-1 border-t border-[var(--border-secondary)]">
          <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-widest">
            LAST UPDATED: {new Date(cyberIntel.timestamp).toLocaleTimeString()} UTC
          </span>
        </div>
      )}
    </motion.div>
  );

  if (maximized && mounted) {
    return createPortal(content, document.body);
  }

  return content;
}
