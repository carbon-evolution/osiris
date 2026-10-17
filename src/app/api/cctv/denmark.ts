import type { CctvCamera } from './types';
import { fetchDenmarkCameras as fetchDenmarkBaseCameras } from './denmark-base';
import { DENMARK_BATCH2_REPLACED_IDS, DENMARK_OFFICIAL_BATCH2 } from './denmark-official-batch2';
import {
  DENMARK_BATCH2_EXTRA_REPLACED_IDS,
  DENMARK_OFFICIAL_BATCH2_EXTRA,
} from './denmark-official-batch2-extra';

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
        !DENMARK_BATCH2_EXTRA_REPLACED_IDS.has(camera.id),
    ),
    ...DENMARK_OFFICIAL_BATCH2,
    ...DENMARK_OFFICIAL_BATCH2_EXTRA,
  ];
}
