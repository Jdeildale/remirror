// Thin wrapper around get-windows that normalizes the return shape and swallows
// errors (we never want a single bad poll to crash the engine).

import { activeWindow } from 'get-windows';
import log from '../log';

export interface WindowSnapshot {
  appName: string | null;
  windowTitle: string | null;
  pid: number | null;
  // The bounds — captured for future multi-monitor hit-test work. Unused in Phase 1.
  bounds: { x: number; y: number; width: number; height: number } | null;
}

let lastGoodSnapshot: WindowSnapshot | null = null;

export async function pollActiveWindow(timeoutMs = 1000): Promise<WindowSnapshot | null> {
  try {
    const result = await Promise.race([
      activeWindow(),
      new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
    ]);
    if (result) {
      const snapshot: WindowSnapshot = {
        appName: result.owner?.name ?? null,
        windowTitle: result.title ?? null,
        pid: result.owner?.processId ?? null,
        bounds: result.bounds ?? null,
      };
      lastGoodSnapshot = snapshot;
      return snapshot;
    }
    // Timed out — return last good snapshot as fallback
    return lastGoodSnapshot;
  } catch (err) {
    log.warn('pollActiveWindow failed:', err);
    return lastGoodSnapshot;
  }
}
