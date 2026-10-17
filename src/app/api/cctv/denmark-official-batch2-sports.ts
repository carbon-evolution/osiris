import type { CctvCamera } from './types';

// Official sports/recreation webcam replacements for Denmark batch 2.
export const DENMARK_BATCH2_SPORT_REPLACED_IDS = new Set<string>([
  'dk-public-gilleleje-golf',
  'dk-public-koge-golf',
  'dk-public-padborg-motocross',
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

  // Køge Golf Klub publishes a current livestream from 1. tee on its own site
  // and identifies the camera as looking toward the starter house. Use the
  // official club page instead of the generic webcam directory.
  {
    id: 'dk-koge-golf-official',
    lat: 55.427222,
    lng: 12.175278,
    name: 'Køge Golf Klub — Livestream fra 1. tee',
    city: 'Køge',
    country: 'Denmark',
    external_url: 'https://www.koegegolf.dk/',
    source: 'Køge Golf Klub',
  },

  // Vesterbæk Moto Cross Club publishes a dedicated Webcam section on its
  // official facilities page. Keep the existing Padborg display position and
  // replace the generic webcam-directory link with the operator source.
  {
    id: 'dk-padborg-vesterbaek-motocross-official',
    lat: 54.871111,
    lng: 9.271111,
    name: 'Padborg — Vesterbæk Moto Cross Club webcam',
    city: 'Padborg',
    country: 'Denmark',
    external_url: 'https://vmc-cross.dk/Faciliteter',
    source: 'Vesterbæk Moto Cross Club',
  },
];
