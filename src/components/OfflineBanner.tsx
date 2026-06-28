'use client';

import { useState } from 'react';

/**
 * Global "serving cached intelligence" banner. Appears when one or more feeds
 * report their upstream source as unreachable (X-OSIRIS-Source-Ok: false),
 * so the operator knows the map is showing last-known-good, not live, data.
 */

interface CacheEntry { status: string; ageSec: number; sourceOk: boolean; }

export default function OfflineBanner({ meta }: { meta: Record<string, CacheEntry> }) {
  const [dismissedSig, setDismissedSig] = useState('');

  const down = Object.entries(meta)
    .filter(([, m]) => !m.sourceOk)
    .map(([kind]) => kind)
    .sort();

  const sig = down.join(',');
  if (down.length === 0 || sig === dismissedSig) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[900] flex items-center justify-center gap-3 px-4 py-1.5"
      style={{
        background: 'linear-gradient(90deg, rgba(255,61,61,0.12) 0%, rgba(255,61,61,0.18) 50%, rgba(255,61,61,0.12) 100%)',
        borderBottom: '1px solid rgba(255,61,61,0.35)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D3D] animate-osiris-pulse" style={{ boxShadow: '0 0 8px #FF3D3D' }} />
      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#FF6B6B]">
        OFFLINE — serving cached intelligence
      </span>
      <span className="font-mono text-[9px] tracking-wider text-[#FF6B6B]/70 hidden sm:inline">
        {down.length} source{down.length > 1 ? 's' : ''} unreachable: {down.join(', ')}
      </span>
      <button
        onClick={() => setDismissedSig(sig)}
        className="ml-2 font-mono text-[9px] tracking-wider text-[#FF6B6B]/60 hover:text-[#FF6B6B] transition-colors"
        title="Dismiss until the set of unreachable sources changes"
      >
        ✕ DISMISS
      </button>
    </div>
  );
}
