import type { CctvCamera } from './types';
import { fetchDenmarkCameras as fetchDenmarkBaseCameras } from './denmark-base';
import { DENMARK_BATCH2_REPLACED_IDS, DENMARK_OFFICIAL_BATCH2 } from './denmark-official-batch2';
import {
  DENMARK_BATCH2_EXTRA_REPLACED_IDS,
  DENMARK_OFFICIAL_BATCH2_EXTRA,
} from './denmark-official-batch2-extra';
import {
  DENMARK_BATCH2_AIRFIELD_REPLACED_IDS,
  DENMARK_OFFICIAL_BATCH2_AIRFIELDS,
} from './denmark-official-batch2-airfields';
import {
  DENMARK_BATCH2_ATTRACTION_REPLACED_IDS,
  DENMARK_OFFICIAL_BATCH2_ATTRACTIONS,
} from './denmark-official-batch2-attractions';
import {
  DENMARK_BATCH2_SPORT_REPLACED_IDS,
  DENMARK_OFFICIAL_BATCH2_SPORTS,
} from './denmark-official-batch2-sports';

/**
 * Denmark camera catalogue with official-source upgrades layered over the
 * existing curated list. Keeping the large historical list in denmark-base.ts
 * makes later source upgrades small and reviewable.
 */
export async function fetchDenmarkCameras(): Promise<CctvCamera[]> {
  const base = await fetchDenmarkBaseCameras();
  return [
    ...base.filter(
      (camera) =>
        !DENMARK_BATCH2_REPLACED_IDS.has(camera.id) &&
        !DENMARK_BATCH2_EXTRA_REPLACED_IDS.has(camera.id) &&
        !DENMARK_BATCH2_AIRFIELD_REPLACED_IDS.has(camera.id) &&
        !DENMARK_BATCH2_ATTRACTION_REPLACED_IDS.has(camera.id) &&
        !DENMARK_BATCH2_SPORT_REPLACED_IDS.has(camera.id),
    ),
    ...DENMARK_OFFICIAL_BATCH2,
    ...DENMARK_OFFICIAL_BATCH2_EXTRA,
    ...DENMARK_OFFICIAL_BATCH2_AIRFIELDS,
    ...DENMARK_OFFICIAL_BATCH2_ATTRACTIONS,
    ...DENMARK_OFFICIAL_BATCH2_SPORTS,
  ];
}
