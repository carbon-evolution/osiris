import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { INTEL_PATHS, readText } from '@/lib/intelSources';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS ← sec-tools recon outputs (local files).
 * Lists assessed targets from sec-tools/output/recon/<target>/ with their
 * summary, open-port count, and tech-stack signal for the OSINT panel.
 * ?target=<name> returns the full detail (ports, subdomains, alive urls).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get('target');
  const root = INTEL_PATHS.reconDir();

  let entries: string[];
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return NextResponse.json({ targets: [], error: 'recon output dir not found — check OPENCODE_ROOT' }, { status: 503 });
  }

  const readJson = async (p: string) => {
    const t = await readText(p);
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  };

  if (target) {
    if (!entries.includes(target)) {
      return NextResponse.json({ error: 'target not found' }, { status: 404 });
    }
    const dir = path.join(root, target);
    const [summary, ports, tech] = await Promise.all([
      readJson(path.join(dir, 'summary.json')),
      readJson(path.join(dir, 'ports.json')),
      readJson(path.join(dir, 'tech_stack.json')),
    ]);
    const subsTxt = await readText(path.join(dir, 'subdomains.txt'));
    const aliveTxt = await readText(path.join(dir, 'alive_urls.txt'));
    return NextResponse.json({
      target,
      summary,
      ports,
      tech_stack: tech,
      subdomains: subsTxt ? subsTxt.split('\n').filter(Boolean) : [],
      alive_urls: aliveTxt ? aliveTxt.split('\n').filter(Boolean) : [],
      source: 'sec-tools recon (local)',
    });
  }

  const targets = await Promise.all(
    entries.map(async (name) => {
      const summary = await readJson(path.join(root, name, 'summary.json'));
      return { target: name, ...(summary ?? {}) };
    }),
  );
  return NextResponse.json({ targets, count: targets.length, source: 'sec-tools recon (local)' });
}
