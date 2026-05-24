import { screen } from 'electron';
import log from '../log';

export interface CursorSnapshot {
  x: number;
  y: number;
  displayId: number;
}

export function getCursorSnapshot(): CursorSnapshot | null {
  try {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    return { x: point.x, y: point.y, displayId: display.id };
  } catch (err) {
    log.warn('getCursorSnapshot failed:', err);
    return null;
  }
}
