import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { BRAND } from '@shared/branding';
import { IPC } from '@shared/ipc-contract';
import type { EngineStatus } from '@shared/types';
import { openMainWindow } from './windows/main-window';
import type { CaptureEngine } from './capture/engine';
import log from './log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let statusHandler: ((status: EngineStatus) => void) | null = null;
let updateDownloadedVersion: string | null = null;
let lastEngine: CaptureEngine | null = null;

const STATUS_LABEL: Record<EngineStatus, string> = {
  active: '● Capture: Active',
  paused: '● Capture: Paused',
  excluded: '● Capture: Excluded app active',
  stopped: '● Capture: Stopped',
};

const TOOLTIP: Record<EngineStatus, string> = {
  active: BRAND.tray.active,
  paused: BRAND.tray.paused,
  excluded: BRAND.tray.excluded,
  stopped: BRAND.appName,
};

export function createTray(engine: CaptureEngine): Tray {
  // From out/main/, the icons live at <project-root>/resources/icons/tray.ico — two levels up.
  const iconPath = path.join(__dirname, '../../resources/icons/tray.ico');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip(BRAND.appName);
  lastEngine = engine;

  tray.on('click', () => openMainWindow());

  rebuildMenu(engine);
  statusHandler = () => rebuildMenu(engine);
  engine.on('status', statusHandler);
  log.info('Tray created');
  return tray;
}

/**
 * Called by the auto-updater when a new version has finished downloading and
 * is ready to install. We surface a "Restart and update" menu item + a balloon
 * notification so the user can install on demand instead of waiting for a
 * manual Quit (which may never come for a tray-resident app).
 */
export function notifyUpdateDownloaded(version: string): void {
  updateDownloadedVersion = version;
  if (lastEngine) rebuildMenu(lastEngine);
  if (tray) {
    tray.displayBalloon({
      title: `Remirror update ready (v${version})`,
      content: 'Click the tray icon → "Restart and update" to install now.',
    });
  }
}

export function destroyTray(engine?: CaptureEngine): void {
  if (statusHandler && engine) engine.off('status', statusHandler);
  statusHandler = null;
  if (tray) { tray.destroy(); tray = null; }
}

export function rebuildMenu(engine: CaptureEngine): void {
  if (!tray) return;
  const status = engine.getStatus();
  const isPaused = status === 'paused';

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Open Remirror', accelerator: BRAND.hotkey.default, click: () => openMainWindow() },
    { type: 'separator' },
    { label: STATUS_LABEL[status], enabled: false },
    {
      label: isPaused ? 'Resume Capture' : 'Pause Capture',
      click: () => isPaused ? engine.resume() : engine.pause(),
    },
    { type: 'separator' },
    { label: 'Settings…', click: () => {
        const win = openMainWindow();
        win.webContents.once('did-finish-load', () => {
          win.webContents.send(IPC.NAVIGATE, 'settings:projects');
        });
        if (!win.webContents.isLoading()) {
          win.webContents.send(IPC.NAVIGATE, 'settings:projects');
        }
      }
    },
  ];

  // Update item (only when an update is downloaded and ready)
  if (updateDownloadedVersion) {
    template.push({ type: 'separator' });
    template.push({
      label: `Restart and update to v${updateDownloadedVersion}`,
      click: async () => {
        // Lazy-import so the updater module isn't loaded when not needed
        const { quitAndInstall } = await import('./updater');
        global.__remirrorQuitting = true;
        quitAndInstall();
      },
    });
  }

  template.push({ type: 'separator' });
  template.push({ label: 'About', enabled: false });
  template.push({
    label: 'Quit',
    click: () => {
      global.__remirrorQuitting = true;
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(TOOLTIP[status]);
}
