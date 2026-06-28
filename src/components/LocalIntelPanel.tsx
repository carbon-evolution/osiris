'use client';

import { useState, useEffect } from 'react';
import { Factory, ShieldAlert, Radar, ExternalLink } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Local Intel Panel
   Surfaces the local Opencode datasets that don't fit the map:
   OTCAD (OT/ICS attack history), ICS-CERT advisories, and
   sec-tools recon outputs. All served from /api/intel/* (local files).
   ═══════════════════════════════════════════════════════════════ */

type Tab = 'otcad' | 'ics' | 'recon';

const SEV_COLOR: Record<string, string> = {
  Critical: '#FF1744', High: '#FF9100', Medium: '#FFD740', Low: '#00E676',
};

interface OtcadItem { id: string; name: string; year: number; industry: string; attack_type: string; sources: string[]; }
interface IcsItem { id: string; advisory: string; title: string; vendor: string; product: string; cve: string; cvss: number | null; severity: string; sector: string; year: number | null; released: string; }
interface ReconTarget { target: string; subdomains_found?: number; alive_count?: number; elapsed_seconds?: number; }

export default function LocalIntelPanel() {
  const [tab, setTab] = useState<Tab>('otcad');
  const [otcad, setOtcad] = useState<{ items: OtcadItem[]; stats?: any } | null>(null);
  const [ics, setIcs] = useState<{ items: IcsItem[]; stats?: any } | null>(null);
  const [recon, setRecon] = useState<{ targets: ReconTarget[]; count?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [o, i, r] = await Promise.allSettled([
        fetch('/api/intel/otcad').then(res => res.json()),
        fetch('/api/intel/ics-advisories?limit=200').then(res => res.json()),
        fetch('/api/intel/recon').then(res => res.json()),
      ]);
      if (cancelled) return;
      if (o.status === 'fulfilled') setOtcad(o.value);
      if (i.status === 'fulfilled') setIcs(i.value);
      if (r.status === 'fulfilled') setRecon(r.value);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Factory; count?: number }> = [
    { id: 'otcad', label: 'OT ATTACKS', icon: Factory, count: otcad?.items?.length },
    { id: 'ics', label: 'ICS ADV', icon: ShieldAlert, count: ics?.items?.length },
    { id: 'recon', label: 'RECON', icon: Radar, count: recon?.targets?.length },
  ];

  return (
    <div className="glass-panel rounded-lg overflow-hidden border border-black/10 bg-white/95 backdrop-blur-md shadow-xl"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-black/10 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#C2185B]">[ LOCAL INTEL ]</div>
        <div className="text-[8px] text-[var(--text-muted)]">opencode · local files</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/10">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 text-[9px] font-bold tracking-wider flex items-center justify-center gap-1 transition-colors ${tab === t.id ? 'bg-[#C2185B]/10 text-[#C2185B]' : 'text-[var(--text-muted)] hover:bg-black/5'}`}>
            <t.icon className="w-3 h-3" />{t.label}
            {t.count != null && <span className="opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="max-h-[420px] overflow-y-auto p-2 text-[10px]">
        {loading && <div className="text-center text-[var(--text-muted)] py-6">Loading…</div>}

        {!loading && tab === 'otcad' && (otcad?.items ?? []).map(it => (
          <div key={it.id} className="mb-1.5 p-2 rounded bg-black/[0.03] border border-black/5">
            <div className="flex justify-between items-start gap-2">
              <span className="font-bold text-[#E8EAED]">{it.name}</span>
              <span className="text-[var(--text-muted)] shrink-0">{it.year}</span>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
              <span className="text-[#1A73E8]">{it.industry}</span> · {it.attack_type}
            </div>
            {it.sources?.[0] && (
              <a href={it.sources[0]} target="_blank" rel="noreferrer"
                className="text-[9px] text-[#C2185B] inline-flex items-center gap-0.5 mt-1 hover:underline">
                source <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        ))}

        {!loading && tab === 'ics' && (ics?.items ?? []).map(it => (
          <div key={it.id} className="mb-1.5 p-2 rounded bg-black/[0.03] border border-black/5">
            <div className="flex justify-between items-start gap-2">
              <span className="font-bold text-[#E8EAED]">{it.vendor} {it.product}</span>
              {it.cvss != null && (
                <span className="shrink-0 px-1 rounded text-[8px] font-bold text-white"
                  style={{ background: SEV_COLOR[it.severity] || '#888' }}>{it.cvss}</span>
              )}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{it.title}</div>
            <div className="text-[8px] text-[var(--text-muted)] mt-0.5 flex gap-2 flex-wrap">
              {it.cve && <span className="text-[#1A73E8]">{it.cve}</span>}
              {it.sector && <span>{it.sector}</span>}
              {it.released && <span>{it.released}</span>}
            </div>
          </div>
        ))}

        {!loading && tab === 'recon' && (recon?.targets ?? []).map(t => (
          <div key={t.target} className="mb-1.5 p-2 rounded bg-black/[0.03] border border-black/5">
            <div className="font-bold text-[#E8EAED]">{t.target}</div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5 flex gap-3">
              <span>subdomains: <span className="text-[#1A73E8]">{t.subdomains_found ?? '—'}</span></span>
              <span>alive: <span className="text-[#00C853]">{t.alive_count ?? '—'}</span></span>
              {t.elapsed_seconds != null && <span>{t.elapsed_seconds}s</span>}
            </div>
          </div>
        ))}

        {!loading && tab === 'otcad' && !(otcad?.items?.length) && <Empty />}
        {!loading && tab === 'ics' && !(ics?.items?.length) && <Empty />}
        {!loading && tab === 'recon' && !(recon?.targets?.length) && <Empty />}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="text-center text-[var(--text-muted)] py-6 text-[9px]">No local data — check OPENCODE_ROOT / run the collectors.</div>;
}
