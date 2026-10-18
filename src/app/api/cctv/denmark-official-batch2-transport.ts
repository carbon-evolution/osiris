import type { CctvCamera } from './types';

// Official transport/bridge webcam replacements for Denmark batch 2.
export const DENMARK_BATCH2_TRANSPORT_REPLACED_IDS = new Set<string>([
  'dk-public-oresund-bridge',
]);

export const DENMARK_OFFICIAL_BATCH2_TRANSPORT: CctvCamera[] = [
  // Øresundsbron publishes two current pylon-camera images on its official
  // traffic-information page. Small marker offsets are display-only so both
  // official views remain clickable; they do not claim exact camera-mount GPS.
  {
    id: 'dk-oresund-bridge-pylon-west',
    lat: 55.594484,
    lng: 12.765238,
    name: 'Øresundsbroen — Pylonkamera mod vest',
    city: 'Copenhagen',
    country: 'Denmark',
    external_url: 'https://www.oresundsbron.com/da/trafikinformation',
    source: 'Øresundsbron',
  },
  {
    id: 'dk-oresund-bridge-pylon-east',
    lat: 55.594404,
    lng: 12.765318,
    name: 'Øresundsbroen — Pylonkamera mod øst',
    city: 'Copenhagen',
    country: 'Denmark',
    external_url: 'https://www.oresundsbron.com/da/trafikinformation',
    source: 'Øresundsbron',
  },
];
