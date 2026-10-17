import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Fixed upstreams only: no caller-supplied URL, so this route cannot be used
// as a general-purpose proxy. PFG currently publishes these snapshots over
// plain HTTP; serving them through OSIRIS avoids browser mixed-content blocks.
const PFG_FEEDS: Record<string, string> = {
  '1': 'http://80.63.222.80/webcam1',
  '2': 'http://80.63.222.80/webcam2',
  '3': 'http://80.63.222.80/webcam3',
};

export async function GET(request: NextRequest) {
  const cam = request.nextUrl.searchParams.get('cam') || '';
  const target = PFG_FEEDS[cam];
  if (!target) {
    return NextResponse.json({ error: 'invalid camera' }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'OSIRIS/4.2' },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream error', status: res.status }, { status: 502 });
    }

    const body = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType.startsWith('image/') ? contentType : 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'camera unavailable', detail }, { status: 504 });
  }
}
