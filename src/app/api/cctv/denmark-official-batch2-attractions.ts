import type { CctvCamera } from './types';

export const DENMARK_BATCH2_ATTRACTION_REPLACED_IDS = new Set<string>([
  'dk-public-givskud-zoo',
]);

export const DENMARK_OFFICIAL_BATCH2_ATTRACTIONS: CctvCamera[] = [
  // The existing generic listing describes the zoo parking/access road.
  // GIVSKUD ZOO's own queue-barometer page publishes live video from the
  // entrance, so OSIRIS links to the operator source instead of WorldCam.
  {
    id: 'dk-givskud-zoo-entrance-official',
    lat: 55.812222,
    lng: 9.350833,
    name: 'GIVSKUD ZOO — Live indkørsel',
    city: 'Givskud',
    country: 'Denmark',
    external_url: 'https://www.givskudzoo.dk/da/besoeg-zoo/koebarometer/',
    source: 'GIVSKUD ZOO - ZOOTOPIA',
  },
];
