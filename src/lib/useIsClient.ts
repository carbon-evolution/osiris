import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * false during server render and hydration, true on the client afterwards.
 * Replaces the `useEffect(() => setMounted(true), [])` guard used before
 * rendering portals, without the extra render.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
