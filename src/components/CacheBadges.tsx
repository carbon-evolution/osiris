'use client';

/**
 * Local-cache freshness indicator. Renders a small badge per cache-first feed
 * showing how old the served data is, and flags when a source is unreachable
 * (so cached/stale data on screen is never mistaken for live).
 */

interface CacheEntry { status: string; ageSec: number; sourceOk: boolean; }

function fmtAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

export default function CacheBadges({ meta }: { meta: Record<string, CacheEntry> }) {
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-[26px] left-3 z-[200] flex flex-col gap-1 pointer-events-none">
      {entries.map(([kind, m]) => {
        const down = !m.sourceOk;
        const stale = m.status === 'stale' || down;
        const color = down ? '#FF3D3D' : stale ? '#E5C158' : '#00E676';
        const label = down
          ? `SOURCE DOWN · cached ${fmtAge(m.ageSec)} ago`
          : m.status === 'miss'
          ? 'live'
          : `cached ${fmtAge(m.ageSec)} ago`;
        return (
          <div
            key={kind}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[8px] tracking-wider"
            style={{
              background: 'rgba(6,8,16,0.72)',
              border: `1px solid ${color}33`,
              color,
              backdropFilter: 'blur(8px)',
            }}
            title={`${kind}: ${m.status}${down ? ' (upstream unreachable)' : ''}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
            <span className="uppercase opacity-90">{kind}</span>
            <span className="opacity-70">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
