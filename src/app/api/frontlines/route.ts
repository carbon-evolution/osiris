import { withCache } from '@/lib/feeds/serve';

import { NextResponse } from 'next/server';

/**
 * OSIRIS — Ukraine Frontline API
 * Fetches live warfront GeoJSON from DeepState Map
 */

async function _GET() {
  try {
    const url = 'https://deepstatemap.live/api/history/last';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000), // Cache 30 min
    });

    if (!res.ok) {
      return NextResponse.json({ frontlines: null, error: 'DeepState unavailable' });
    }

    const data = await res.json();

    return NextResponse.json({
      frontlines: data,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Frontlines fetch error:', error);
    return NextResponse.json({ frontlines: null, error: 'Failed to fetch frontline data' }, { status: 500 });
  }
}

export const GET = withCache('frontlines', 3600000, _GET);
