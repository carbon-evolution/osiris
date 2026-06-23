import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';
import { fetchAcledEvents, acledConfigured } from '@/lib/acled';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Real-Time Geopolitical Events
 * Sources: GDELT 2.0 GEO API (keyless) + ACLED structured conflict events
 * (opt-in, OAuth — only used when ACLED_EMAIL/ACLED_PASSWORD are set).
 */

export async function GET() {
  try {
    // ACLED — structured, geocoded conflict events with actors + fatalities.
    // Runs in parallel; skipped entirely when credentials aren't configured.
    const acledPromise = fetchAcledEvents();

    // GDELT GEO 2.0 API — real events with actual coordinates. Each query is
    // tagged with an incident category so the map/popup can show what kind of
    // event it is. Categories broadened beyond protest/conflict/coup.
    const queries: { q: string; type: string; category: string }[] = [
      { q: 'protest OR riot OR unrest OR demonstration', type: 'unrest', category: 'Civil Unrest' },
      { q: 'conflict OR military OR attack OR strike OR shelling', type: 'conflict', category: 'Armed Conflict' },
      { q: 'explosion OR blast OR bombing OR airstrike', type: 'conflict', category: 'Explosion / Strike' },
      { q: 'terror OR terrorist OR hostage OR insurgent', type: 'conflict', category: 'Terrorism' },
      { q: 'coup OR revolution OR emergency OR martial law', type: 'political', category: 'Political Crisis' },
      { q: 'refugees OR displacement OR humanitarian OR famine OR evacuation', type: 'humanitarian', category: 'Humanitarian' },
      { q: 'cyberattack OR ransomware OR data breach OR hacking', type: 'cyber', category: 'Cyber' },
    ];

    const allEvents: any[] = [];
    let eventId = 0;

    // Run all GDELT category queries in parallel so total latency stays ~5s
    // regardless of how many categories there are (and so a down/slow GDELT
    // never stacks 7 sequential timeouts).
    const gdeltResults = await Promise.allSettled(
      queries.map(async ({ q, type, category }) => {
        const url = `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(q)}&format=GeoJSON&timespan=24h&maxpoints=100`;
        const res = await stealthFetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
        if (!res.ok) throw new Error('Not OK');
        const geojson = await res.json();
        return { type, category, features: geojson?.features || [] };
      }),
    );

    for (const r of gdeltResults) {
      if (r.status !== 'fulfilled') continue;
      const { type, category, features } = r.value;
      for (const feature of features) {
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;

        const props = feature.properties || {};
        const name = props.name || props.html?.replace(/<[^>]*>/g, '').slice(0, 120) || 'GDELT Event';
        const articleUrl = props.url || (/href="([^"]+)"/.exec(props.html || '')?.[1]) || '';

        const isDupe = allEvents.some(e =>
          Math.abs(e.lat - coords[1]) < 0.5 && Math.abs(e.lng - coords[0]) < 0.5 && e.name === name,
        );
        if (isDupe) continue;

        allEvents.push({
          id: `gdelt-${eventId++}`,
          lat: coords[1],
          lng: coords[0],
          name,
          url: articleUrl,
          html: props.html || '',
          type,
          category,
          count: props.count || 1,
          shareimage: props.shareimage || '',
          source: 'GDELT',
        });
      }
    }

    // Merge ACLED events (precise coords, actors, fatalities). These are
    // high-confidence, so they're added ahead of the simulated fallback and
    // suppress it when present.
    let acledCount = 0;
    try {
      const acled = await acledPromise;
      acledCount = acled.length;
      for (const a of acled) {
        const dupe = allEvents.some(
          (e) => Math.abs(e.lat - a.lat) < 0.25 && Math.abs(e.lng - a.lng) < 0.25 && e.name === a.name,
        );
        if (!dupe) {
          allEvents.push({
            id: a.id, lat: a.lat, lng: a.lng, name: a.name, url: a.url, html: '',
            type: a.type, category: a.category, count: a.count,
            fatalities: a.fatalities, actors: a.actors, country: a.country, date: a.date,
            shareimage: '', source: 'ACLED',
          });
        }
      }
    } catch { /* ACLED is best-effort */ }

    // Fallback only if BOTH live sources came back empty (simulated demo data).
    if (allEvents.length === 0) {
      const generateFallback = (type: string, name: string, count: number, latBase: number, lngBase: number, spread: number) => {
        for(let i=0; i<count; i++) {
          allEvents.push({
            id: `gdelt-fb-${eventId++}`,
            lat: latBase + (Math.random() * spread - spread/2),
            lng: lngBase + (Math.random() * spread - spread/2),
            name: `${name} reported in the area.`,
            url: '',
            html: `Local reports indicate ${name.toLowerCase()}.`,
            type: type,
            count: Math.floor(Math.random() * 5) + 1,
            shareimage: ''
          });
        }
      };
      
      // Inject simulated incidents across key regions
      generateFallback('conflict', 'Military strikes', 15, 48.5, 31.2, 5); // Ukraine
      generateFallback('conflict', 'Armed clashes', 10, 31.5, 34.5, 2); // Gaza
      generateFallback('conflict', 'Border shelling', 8, 33.2, 35.5, 1.5); // Lebanon
      generateFallback('unrest', 'Civil unrest', 12, 15.0, 30.0, 10); // Sudan
      generateFallback('conflict', 'Rebel offensive', 8, -1.0, 28.5, 5); // DRC
      generateFallback('political', 'Emergency declared', 5, 24.0, 119.5, 2); // Taiwan
      generateFallback('unrest', 'Widespread protests', 10, 48.8, 2.3, 3); // France
      generateFallback('unrest', 'Violent riots', 6, 40.7, -74.0, 5); // US East
    }

    const usedSources = [
      allEvents.some((e) => e.source === 'GDELT') ? 'GDELT' : null,
      acledCount ? 'ACLED' : null,
    ].filter(Boolean);
    const source = allEvents[0]?.id?.includes('fb')
      ? 'OSIRIS Simulated Incident Engine'
      : (usedSources.join(' + ') || 'none');

    return NextResponse.json({
      events: allEvents,
      total: allEvents.length,
      acled_configured: acledConfigured(),
      timestamp: new Date().toISOString(),
      source,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] GDELT fetch error:', error);
    return NextResponse.json({ events: [], total: 0, error: 'GDELT unavailable' }, { status: 500 });
  }
}
