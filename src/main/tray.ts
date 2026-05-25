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

  tray.on('click', () => openMainWindow());

  rebuildMenu(engine);
  engine.on('status', () => rebuildMenu(engine));
  log.info('Tray created');
  return tray;
}

export function rebuildMenu(engine: CaptureEngine): void {
  if (!tray) return;
  const status = engine.getStatus();
  const isPaused = status === 'paused';

  const menu = Menu.buildFromTemplate([
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
        // If already loaded, send immediately too.
        if (!win.webContents.isLoading()) {
          win.webContents.send(IPC.NAVIGATE, 'settings:projects');
        }
      }
    },
    { type: 'separator' },
    { label: 'About', enabled: false }, // Phase 1: no About dialog yet
    {
      label: 'Quit',
      click: () => {
        global.__remirrorQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(TOOLTIP[status]);
}
