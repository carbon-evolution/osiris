import type { CctvCamera } from './types';

// Additional official harbour webcam replacements for Denmark batch 2.
export const DENMARK_BATCH2_HARBOUR_EXTRA_REPLACED_IDS = new Set<string>([
  'dk-public-lihme-gyldendal',
]);

export const DENMARK_OFFICIAL_BATCH2_HARBOURS_EXTRA: CctvCamera[] = [
  // Gyldendal Havn publishes its own public webcam page titled “Webcam –
  // Oplev havnen live”. Use the harbour's official page instead of the generic
  // directory entry; no hidden or transient media endpoint is needed.
  {
    id: 'dk-gyldendal-havn-official',
    lat: 56.580833,
    lng: 8.710833,
    name: 'Gyldendal Havn — Webcam',
    city: 'Lihme',
    country: 'Denmark',
    external_url: 'https://gyldendalhavn.dk/webcam/',
    source: 'Gyldendal Havn',
  },
];
