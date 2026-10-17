import type { CctvCamera } from './types';

// Additional official-source cleanup for Denmark batch 2.
export const DENMARK_BATCH2_EXTRA_REPLACED_IDS = new Set<string>([
  'dk-public-rungsted-marina',
  'dk-public-vestero-havn',
  'dk-public-koge-marina',
  'dk-public-hundested-harbor',
  'dk-public-hirtshals-harbour',
  'dk-public-anholt-harbour',
  'dk-public-hvide-sande-sportsfisker',
  'dk-public-hvide-sande-kabelpark',
  'dk-public-hvide-sande-lyngvig-fyr',
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

  // Port of Hirtshals publishes two public JPEG webcam views on its official
  // webcam page. Both direct image URLs returned HTTP 200 image/jpeg during
  // live verification on 2026-10-17.
  {
    id: 'dk-hirtshals-port-north',
    lat: 57.59226,
    lng: 9.96912,
    name: 'Hirtshals Havn — Nordlig retning',
    city: 'Hirtshals',
    country: 'Denmark',
    feed_url: 'https://data.portofhirtshals.dk/webcam/webcam.aspx?imgno=2',
    stream_type: 'jpg',
    external_url: 'https://portofhirtshals.dk/da/aktuelt/webcams',
    source: 'Port of Hirtshals',
  },
  {
    id: 'dk-hirtshals-port-east',
    lat: 57.59218,
    lng: 9.96922,
    name: 'Hirtshals Havn — Østlig retning',
    city: 'Hirtshals',
    country: 'Denmark',
    feed_url: 'https://data.portofhirtshals.dk/webcam/webcam.aspx?imgno=1',
    stream_type: 'jpg',
    external_url: 'https://portofhirtshals.dk/da/aktuelt/webcams',
    source: 'Port of Hirtshals',
  },

  // Anholt Havn publishes a public livestream on its official facilities page.
  // The current player is cookie-gated and does not expose a stable public
  // media URL, so OSIRIS links to the official webcam section.
  {
    id: 'dk-anholt-havn-official',
    lat: 56.715556,
    lng: 11.514167,
    name: 'Anholt Havn — Livestream',
    city: 'Anholt',
    country: 'Denmark',
    external_url: 'https://anholthavn.dk/faciliteter/#webcam',
    source: 'Anholt Havn',
  },

  // Hvide Sande Sportsfisker Center publishes a dedicated webcam page with a
  // public YouTube player. Use the operator page rather than depending on a
  // third-party webcam directory.
  {
    id: 'dk-hvide-sande-sportsfisker-official',
    lat: 56.003889,
    lng: 8.127778,
    name: 'Hvide Sande — Sportsfisker Center webcam',
    city: 'Hvide Sande',
    country: 'Denmark',
    external_url: 'https://www.hvidesande-sportsfiskercenter.dk/webcam',
    source: 'Hvide Sande Sportsfisker Center',
  },

  // Kabelpark Hvide Sande publishes two live webcam embeds on its official
  // Livecams page. The embedded provider URLs are not exposed as stable public
  // endpoints, so both markers open the operator's livecam page.
  {
    id: 'dk-hvide-sande-kabelpark-1',
    lat: 56.01866,
    lng: 8.13051,
    name: 'Hvide Sande Kabelpark — Livecam 1',
    city: 'Hvide Sande',
    country: 'Denmark',
    external_url: 'https://kabelpark.dk/livecams/',
    source: 'Kabelpark Hvide Sande',
  },
  {
    id: 'dk-hvide-sande-kabelpark-2',
    lat: 56.01856,
    lng: 8.13061,
    name: 'Hvide Sande Kabelpark — Livecam 2',
    city: 'Hvide Sande',
    country: 'Denmark',
    external_url: 'https://kabelpark.dk/livecams/',
    source: 'Kabelpark Hvide Sande',
  },

  // Ringkøbing Fjord Museer publishes the Lyngvig Fyr webcam on the official
  // lighthouse page in collaboration with Esmark. The page exposes a public
  // YouTube watch URL; OSIRIS links to the official museum page so ownership
  // and context remain clear.
  {
    id: 'dk-hvide-sande-lyngvig-fyr-official',
    lat: 56.05,
    lng: 8.105556,
    name: 'Lyngvig Fyr — Webcam',
    city: 'Hvide Sande',
    country: 'Denmark',
    external_url: 'https://ringkobingfjordmuseer.dk/museer/lyngvig-fyr/',
    source: 'Ringkøbing Fjord Museer',
  },

  // Vesterø Havn's official website still labels a link as "Webcam", but its
  // current destination (laesoe-vejr.dk) no longer exposes a public webcam.
  // The stale third-party marker is therefore filtered above without a
  // replacement until the operator publishes a working public camera again.

  // Hundested Havn's own webcam page currently labels the camera as defective.
  // The stale third-party marker is filtered above without a replacement until
  // the harbour reports a working public camera again.
];
