import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMainBrowserWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // External links open in the OS browser, never in-app.
  // Only http/https/mailto schemes are forwarded; all others are silently denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
        void shell.openExternal(url);
      }
    } catch { /* malformed URL, ignore */ }
    return { action: 'deny' };
  });

  // Also block in-window navigation to external schemes
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
        void shell.openExternal(url);
      }
    } catch { /* ignore */ }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
