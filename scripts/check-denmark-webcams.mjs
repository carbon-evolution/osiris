// Read-only, best-effort checks of the explicitly published Danish image feeds.
// No credentials are used and no camera controls are accessed.
import { readFile, appendFile } from 'node:fs/promises';

const source = await readFile('src/app/api/cctv/denmark.ts', 'utf8');
const entries = [...source.matchAll(/\{\s*id:\s*'(dk-[^']+)'([\s\S]*?)\n\s*\},/g)]
  .map(([, id, fields]) => ({
    id,
    url: fields.match(/\bfeed_url:\s*'([^']+)'/)?.[1],
  }))
  .filter(({ url }) => url);

function isImage(bytes, contentType) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
  return (jpeg || png || webp) && !contentType.includes('text/html');
}

async function check({ id, url }) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'OSIRIS-public-webcam-smoke-test/1.0' },
    });
    if (!response.ok) return { id, status: 'FAIL', detail: `HTTP ${response.status}` };
    const reader = response.body?.getReader();
    if (!reader) return { id, status: 'FAIL', detail: 'No response body' };
    const { value } = await reader.read();
    await reader.cancel().catch(() => {});
    const bytes = value ?? new Uint8Array();
    const type = response.headers.get('content-type') ?? '';
    return { id, status: isImage(bytes, type) ? 'IMAGE' : 'FAIL', detail: type || 'unknown content type' };
  } catch (error) {
    return { id, status: 'UNREACHABLE', detail: error?.name || 'connection error' };
  }
}

const results = [];
for (let i = 0; i < entries.length; i += 4) {
  results.push(...await Promise.all(entries.slice(i, i + 4).map(check)));
}
const summary = [
  '## Denmark public webcam connectivity (non-blocking)',
  '',
  'This checks the public image URLs from GitHub Actions, not whether a feed displays in a browser.',
  '',
  '| Camera | Result | Detail |',
  '| --- | --- | --- |',
  ...results.map(r => `| ${r.id} | ${r.status} | ${r.detail.replaceAll('|', '/')} |`),
  '',
  `Image responses: ${results.filter(r => r.status === 'IMAGE').length}/${entries.length}.`,
  'An unreachable feed can be temporarily offline or block automated requests.',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
