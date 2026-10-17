import type { CctvCamera } from './types';

// Additional official-source cleanup for Denmark batch 2.
export const DENMARK_BATCH2_EXTRA_REPLACED_IDS = new Set<string>([
  'dk-public-rungsted-harbour',
  'dk-public-vestero-harbour-laeso',
]);

export const DENMARK_OFFICIAL_BATCH2_EXTRA: CctvCamera[] = [
  // Rungsted Havn publishes a public live webcam on its official website.
  // The underlying IPCamLive player is domain-locked to rungsted-havn.dk, so
  // OSIRIS links to the operator page instead of bypassing that restriction or
  // presenting a broken third-party iframe.
  {
    id: 'dk-rungsted-havn-official',
    lat: 55.883056,
    lng: 12.55,
    name: 'Rungsted Havn — Live webcam',
    city: 'Rungsted',
    country: 'Denmark',
    external_url: 'https://rungsted-havn.dk/webcam-vejret/',
    source: 'Rungsted Havn',
  },

  // Vesterø Havn's official website still labels a link as "Webcam", but its
  // current destination (laesoe-vejr.dk) no longer exposes a public webcam.
  // The stale third-party marker is therefore filtered above without a
  // replacement until the operator publishes a working public camera again.
];
