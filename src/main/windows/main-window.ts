declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
}

import { BrowserWindow } from 'electron';
import { createMainBrowserWindow } from './create';

let win: BrowserWindow | null = null;

export function openMainWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    // CRITICAL: must call show() before focus() — a hidden window (which is what
    // we have after the X-button close handler ran) can't be focused into
    // visibility. Without this, clicking "Open Remirror" in the tray after
    // closing the window appears to do nothing.
    if (!win.isVisible()) win.show();
    win.focus();
    return win;
  }
  win = createMainBrowserWindow();
  win.on('close', (e) => {
    // Hide instead of quit. Quit only via tray menu.
    if (!global.__remirrorQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}
