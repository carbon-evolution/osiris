import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Submarine Cables API
 *
 * Serves the global submarine cable dataset as GeoJSON FeatureCollection.
 * Source: Submarine Cable Map (submarinecablemap.com) / OSM-derived open data.
 */

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'submarine-cables.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=259200',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[OSIRIS] Cables error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ type: 'FeatureCollection', features: [], error: 'Cables data unavailable' }, { status: 500 });
  }
}
