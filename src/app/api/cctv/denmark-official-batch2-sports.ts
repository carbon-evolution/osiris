import type { CctvCamera } from './types';

// Official sports/recreation webcam replacements for Denmark batch 2.
export const DENMARK_BATCH2_SPORT_REPLACED_IDS = new Set<string>([
  'dk-public-gilleleje-golf',
]);

export const DENMARK_OFFICIAL_BATCH2_SPORTS: CctvCamera[] = [
  // Gilleleje Golfklub publishes an official course-status page with the
  // section “Banen lige NU – webcam (starterhus og 1. tee)”. Use the club's
  // own page instead of the generic webcam directory; no hidden media endpoint
  // is required for the replacement.
  {
    id: 'dk-gilleleje-golf-official',
    lat: 56.081389,
    lng: 12.366667,
    name: 'Gilleleje Golfklub — Webcam',
    city: 'Gilleleje',
    country: 'Denmark',
    external_url: 'https://www.ggk.dk/baner/banestatus/',
    source: 'Gilleleje Golfklub',
  },
];
