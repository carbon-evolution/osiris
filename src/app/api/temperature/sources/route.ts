import { NextResponse } from 'next/server';
import { SOURCES } from '../field/sources';

/**
 * OSIRIS — Temperature data source catalogue.
 * Lists every registered government / authoritative provider and whether it is a
 * live selectable backend or planned (key-gated / different paradigm).
 */
export function GET() {
  return NextResponse.json(
    { sources: SOURCES, live: SOURCES.filter((s) => s.status === 'live').length, total: SOURCES.length },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
