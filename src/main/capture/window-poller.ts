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

export async function pollActiveWindow(): Promise<WindowSnapshot | null> {
  try {
    const result = await activeWindow();
    if (!result) return null;
    return {
      appName: result.owner?.name ?? null,
      windowTitle: result.title ?? null,
      pid: result.owner?.processId ?? null,
      bounds: result.bounds ?? null,
    };
  } catch (err) {
    log.warn('pollActiveWindow failed:', err);
    return null;
  }
}
