import type { CctvCamera } from './types';

// Additional official-source cleanup for Denmark batch 2.
export const DENMARK_BATCH2_EXTRA_REPLACED_IDS = new Set<string>([
  'dk-public-rungsted-marina',
  'dk-public-vestero-havn',
  'dk-public-koge-marina',
  'dk-public-hundested-harbor',
]);

export const DENMARK_OFFICIAL_BATCH2_EXTRA: CctvCamera[] = [
  // Rungsted Havn publishes a public live webcam on its official website.
  // The underlying IPCamLive player is domain-locked to rungsted-havn.dk, so
  // OSIRIS links to the operator page instead of bypassing that restriction or
  // presenting a broken third-party iframe.
  {
    id: 'dk-rungsted-havn-official',
    lat: 55.886111,
    lng: 12.545556,
    name: 'Rungsted Havn — Live webcam',
    city: 'Rungsted',
    country: 'Denmark',
    external_url: 'https://rungsted-havn.dk/webcam-vejret/',
    source: 'Rungsted Havn',
  },

  // Køge Marina explicitly publishes a LIVE TV2 weather camera on its official
  // website. No stable public media URL is exposed by the page, so OSIRIS links
  // to the operator page instead of guessing or scraping a transient endpoint.
  {
    id: 'dk-koge-marina-official',
    lat: 55.470278,
    lng: 12.196111,
    name: 'Køge Marina — TV2 LIVE vejrkamera',
    city: 'Køge',
    country: 'Denmark',
    external_url: 'https://www.koegemarina.dk/cms/?cmsid=589&pageid=19447',
    source: 'Køge Marina',
  },

  // Vesterø Havn's official website still labels a link as "Webcam", but its
  // current destination (laesoe-vejr.dk) no longer exposes a public webcam.
  // The stale third-party marker is therefore filtered above without a
  // replacement until the operator publishes a working public camera again.

  // Hundested Havn's own webcam page currently labels the camera as defective.
  // The stale third-party marker is filtered above without a replacement until
  // the harbour reports a working public camera again.
];
