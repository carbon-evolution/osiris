/**
 * Indonesian CCTV HLS hosts that must be proxied through /api/cctv/hls.
 *
 * These feeds are loaded by hls.js directly in the browser, but several of
 * them (notably jmlive.jasamarga.com, ~60% of Indonesia cameras) return
 * `Access-Control-Allow-Origin` inconsistently or not at all, so the browser
 * blocks the cross-origin fetch and the video stays black. Routing them
 * through the same-origin proxy removes the CORS dependency. Hosts not in
 * this list (e.g. other regions whose CDNs send CORS correctly) keep playing
 * directly, so this change is scoped to Indonesia only.
 *
 * Match is by hostname (port stripped). Imported by both the proxy route and
 * the client CameraViewer, so this file must stay free of server-only code.
 */
export const HLS_PROXY_HOSTS: readonly string[] = [
  'jmlive.jasamarga.com',
  'its.binamarga.pu.go.id',
  'apps.ptbtu.com',
  'streaming-cct.co.id',
  'extstream.hk-opt2.com',
  'pantau.margamandala.co.id',
  'cctv.wikaserangpanimbang.com',
  'cctv.waskitabumiwira.com',
  'toljomo.margaharjaya.co.id',
  'camera.jtd.co.id',
  'cctvjorrw1.com',
];

/** True if the given stream URL's host should be routed through the HLS proxy. */
export function needsHlsProxy(streamUrl: string): boolean {
  try {
    return HLS_PROXY_HOSTS.includes(new URL(streamUrl).hostname);
  } catch {
    return false;
  }
}

/** Wrap a stream URL in the same-origin HLS proxy. */
export function toHlsProxyUrl(streamUrl: string): string {
  return `/api/cctv/hls?url=${encodeURIComponent(streamUrl)}`;
}
