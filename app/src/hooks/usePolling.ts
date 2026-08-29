import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

/**
 * Runs `callback` immediately when the screen gains focus, then every
 * `intervalMs` (default 60s) while focused. Cleared on blur/unmount.
 * No background fetch (HANDOFF Section 9).
 *
 * `callback` is part of the effect's dependencies: when the caller's closure
 * changes (e.g. PlantDataScreen's chart window), the data it would fetch has
 * changed too, so we re-run immediately instead of waiting for the next tick.
 * Callers MUST memoize with useCallback or this will re-fetch every render.
 */
export function usePolling(callback: () => void, intervalMs = 60_000): void {
  useFocusEffect(
    useCallback(() => {
      callback();
      const id = setInterval(callback, intervalMs);
      return () => clearInterval(id);
    }, [callback, intervalMs]),
  );
}
