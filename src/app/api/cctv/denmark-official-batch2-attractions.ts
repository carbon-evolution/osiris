import type { CctvCamera } from './types';

export const DENMARK_BATCH2_ATTRACTION_REPLACED_IDS = new Set<string>([
  'dk-public-givskud-zoo',
  'dk-public-knebel-sletterhage',
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

  // Sletterhage Fyrs Venner embeds a public IPCamLive player directly on the
  // official lighthouse homepage. Use the operator page rather than the
  // generic webcam-directory listing; no hidden media endpoint is required.
  {
    id: 'dk-sletterhage-fyr-official',
    lat: 56.095278,
    lng: 10.513056,
    name: 'Sletterhage Fyr — Live webcam',
    city: 'Knebel',
    country: 'Denmark',
    external_url: 'https://www.sletterhagefyr.dk/',
    source: 'Sletterhage Fyrs Venner',
  },

  // GeoCenter Møns Klint publishes a 24/7 livestream from Dronningestolen.
  // The official Møns Klint UNESCO nomination dossier gives Dronningestolen
  // as N 54° 58' 04" E 12° 33' 01", which is used for the display marker.
  {
    id: 'dk-moens-klint-dronningestolen-official',
    lat: 54.967778,
    lng: 12.550278,
    name: 'Møns Klint — Dronningestolen webcam',
    city: 'Borre',
    country: 'Denmark',
    external_url: 'https://www.moensklint.dk/fr/webcam/',
    source: 'GeoCenter Møns Klint',
  },
];
