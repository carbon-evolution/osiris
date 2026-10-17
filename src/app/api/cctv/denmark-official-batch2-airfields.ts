import type { CctvCamera } from './types';

// Official airfield webcam upgrades verified on 2026-10-17.
export const DENMARK_BATCH2_AIRFIELD_REPLACED_IDS = new Set<string>([
  'dk-public-skive-flyveklub',
  'dk-public-ronnede-flyveklub',
  'dk-public-randers-airport',
]);

export const DENMARK_OFFICIAL_BATCH2_AIRFIELDS: CctvCamera[] = [
  // Skive Lufthavn publishes three public IPCamLive views on its official
  // webcam page: tower/apron, apron/runway and tower/runway/windsock.
  // Use the exact player pages linked by the airport rather than guessing
  // transient media endpoints.
  {
    id: 'dk-skive-airfield-apron',
    lat: 56.55091,
    lng: 9.17103,
    name: 'Skive Lufthavn — Tårn / forplads',
    city: 'Skive',
    country: 'Denmark',
    external_url: 'https://www.ipcamlive.com/eksv4',
    source: 'Skive Lufthavn',
  },
  {
    id: 'dk-skive-airfield-runway-apron',
    lat: 56.55083,
    lng: 9.17111,
    name: 'Skive Lufthavn — Forplads / bane',
    city: 'Skive',
    country: 'Denmark',
    external_url: 'https://www.ipcamlive.com/eksv2',
    source: 'Skive Lufthavn',
  },
  {
    id: 'dk-skive-airfield-runway-windsock',
    lat: 56.55075,
    lng: 9.17119,
    name: 'Skive Lufthavn — Bane / vindpose',
    city: 'Skive',
    country: 'Denmark',
    external_url: 'https://www.ipcamlive.com/eksv3',
    source: 'Skive Lufthavn',
  },

  // Øst-Sjællands Flyveklub publishes two direct HTTPS JPEG snapshots on its
  // official webcam page. Both returned HTTP 200 image/jpeg on 2026-10-17 and
  // the page states that the images refresh automatically once per minute.
  {
    id: 'dk-ronnede-osf-north',
    lat: 55.25032,
    lng: 12.06079,
    name: 'Rønnede — Øst-Sjællands Flyveklub nord',
    city: 'Rønnede',
    country: 'Denmark',
    feed_url: 'https://cam10.ekks.dk/snap.jpeg',
    stream_type: 'jpg',
    external_url: 'https://flyveklubben.dk/webcam/',
    source: 'Øst-Sjællands Flyveklub',
  },
  {
    id: 'dk-ronnede-osf-east',
    lat: 55.25024,
    lng: 12.06087,
    name: 'Rønnede — Øst-Sjællands Flyveklub øst',
    city: 'Rønnede',
    country: 'Denmark',
    feed_url: 'https://cam11.ekks.dk/snap.jpeg',
    stream_type: 'jpg',
    external_url: 'https://flyveklubben.dk/webcam/',
    source: 'Øst-Sjællands Flyveklub',
  },

  // Randers Flyveklub publishes an official EKRD webcam page on its own domain.
  // Replace the generic Randers Airport directory listing with the operator's
  // public webcam page instead of relying on a third-party index.
  {
    id: 'dk-randers-airport-official',
    lat: 56.506111,
    lng: 10.036389,
    name: 'Randers Flyveplads (EKRD) — Webcam',
    city: 'Randers',
    country: 'Denmark',
    external_url: 'https://www.randersflyveklub.dk/pi-cam/',
    source: 'Randers Flyveklub',
  },
];
