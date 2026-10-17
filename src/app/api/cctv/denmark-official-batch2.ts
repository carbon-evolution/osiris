import type { CctvCamera } from './types';

// Official Denmark webcam sources verified in October 2026.
// Small display offsets are used for co-located cameras so each marker remains clickable.
export const DENMARK_BATCH2_REPLACED_IDS = new Set<string>([
  'dk-public-kalundborg-flyveplads',
]);

export const DENMARK_OFFICIAL_BATCH2: CctvCamera[] = [
  // Polyteknisk Flyvegruppe, Kalundborg Flyveplads (EKKL).
  // All three snapshot endpoints returned current JPEG frames on 2026-10-17.
  {
    id: 'dk-kalundborg-pfg-1',
    lat: 55.70008,
    lng: 11.26046,
    name: 'Kalundborg Flyveplads — PFG',
    city: 'Kalundborg',
    country: 'Denmark',
    feed_url: '/api/cctv/denmark-official?cam=1',
    stream_type: 'jpg',
    external_url: 'https://pfg.dk/webcam',
    source: 'Polyteknisk Flyvegruppe',
  },
  {
    id: 'dk-kalundborg-pfg-2',
    lat: 55.70000,
    lng: 11.26056,
    name: 'Kalundborg Flyveplads — Southeast',
    city: 'Kalundborg',
    country: 'Denmark',
    feed_url: '/api/cctv/denmark-official?cam=2',
    stream_type: 'jpg',
    external_url: 'https://pfg.dk/webcam',
    source: 'Polyteknisk Flyvegruppe',
  },
  {
    id: 'dk-kalundborg-pfg-3',
    lat: 55.69992,
    lng: 11.26066,
    name: 'Kalundborg Flyveplads — Southwest',
    city: 'Kalundborg',
    country: 'Denmark',
    feed_url: '/api/cctv/denmark-official?cam=3',
    stream_type: 'jpg',
    external_url: 'https://pfg.dk/webcam',
    source: 'Polyteknisk Flyvegruppe',
  },

  // Læsø Kommune, Læsø Flyveplads. The municipality states that the images
  // normally refresh every 10 minutes. Both images share the same physical
  // webcam position; tiny display offsets keep both markers selectable.
  {
    id: 'dk-laesoe-airfield-telemast',
    lat: 57.27624,
    lng: 11.00744,
    name: 'Læsø Flyveplads — Telemast / sigtbarhed',
    city: 'Læsø',
    country: 'Denmark',
    feed_url: 'https://cdn.moliri.dk/image/moliri-public/laesoekommune/thumbnail?filename=telemast.jpg&folderPath=Dokumenter%2fSubsides%2fFlyveplads%2fWebcam&width=800',
    stream_type: 'jpg',
    external_url: 'https://www.laesoe.dk/borger/trafik-og-veje/laesoe-flyveplads/webcam-paa-flyvepladsen',
    source: 'Læsø Kommune',
  },
  {
    id: 'dk-laesoe-airfield-windsock',
    lat: 57.27616,
    lng: 11.00756,
    name: 'Læsø Flyveplads — Vindpose / landingsbane',
    city: 'Læsø',
    country: 'Denmark',
    feed_url: 'https://cdn.moliri.dk/image/moliri-public/laesoekommune/thumbnail?filename=vindpose.jpg&folderPath=Dokumenter%2fSubsides%2fFlyveplads%2fWebcam&width=800',
    stream_type: 'jpg',
    external_url: 'https://www.laesoe.dk/borger/trafik-og-veje/laesoe-flyveplads/webcam-paa-flyvepladsen',
    source: 'Læsø Kommune',
  },
];
