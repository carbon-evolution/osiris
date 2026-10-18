import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy. Kept as a list so each directive can be justified.
// - script-src: 'unsafe-inline' is still needed for the App Router's inline
//   bootstrap/RSC scripts on the statically prerendered page and for the
//   onclick handlers in map popup HTML; nonces would force dynamic rendering.
//   'unsafe-eval' is only needed by Next dev (HMR / React refresh).
// - img/media/frame/connect allow any https: origin because CCTV snapshots,
//   HLS streams and embedded players come from many data-driven camera hosts.
//   Scripts stay same-origin only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' https:${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

// Deny browser features OSIRIS does not use. fullscreen (F-key shortcut and
// camera players), autoplay and encrypted-media are delegated to embedded
// players via their iframe `allow` attribute, so their allowlist must permit
// cross-origin frames; clipboard-write is used by the share panel.
const permissionsPolicy = [
  'accelerometer=()',
  'autoplay=*',
  'camera=()',
  'clipboard-read=()',
  'clipboard-write=(self)',
  'display-capture=()',
  'encrypted-media=*',
  'fullscreen=*',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
  'browsing-topics=()',
].join(', ');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['ws'],
  // No component uses next/image, so the /_next/image optimizer is turned off.
  // It previously allowed any https host, which made it an open fetch proxy
  // and exposed Next's image-optimizer SSRF/RCE advisories.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Permissions-Policy', value: permissionsPolicy },
          // Isolate the browsing context from cross-origin popups/openers.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Only OSIRIS itself loads its assets/API (CasaOS/social metadata
          // point at GitHub raw or are fetched server-side, where CORP is not
          // enforced). COEP is deliberately not set: require-corp/credentialless
          // would block the third-party camera images, HLS video and embedded
          // players that send no CORP/CORS headers.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;
