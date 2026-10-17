import type { CctvCamera } from './types';

// Additional official harbour/ferry webcam replacements for Denmark batch 2.
export const DENMARK_BATCH2_HARBOUR_EXTRA_REPLACED_IDS = new Set<string>([
  'dk-public-lihme-gyldendal',
  'dk-public-oro-ostre-faerge',
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

  // Østre Færge A/S publishes an official Webcam/vind page with public views
  // of both Østre Færge and Karen Orø. Keep the existing Orø marker position
  // rather than pretending a moving ferry has a fixed live coordinate.
  {
    id: 'dk-oro-ostre-faerge-official',
    lat: 55.756944,
    lng: 11.835556,
    name: 'Orø — Østre Færge webcam',
    city: 'Orø',
    country: 'Denmark',
    external_url: 'https://xn--strefrge-n0a8o.dk/webcam-vind/',
    source: 'Østre Færge A/S',
  },
];
