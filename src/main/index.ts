import { app, dialog } from 'electron';
import path from 'path';
import { BRAND } from '@shared/branding';
import log, { configureFileTransport } from './log';
import { openDatabase, getDatabase, closeDatabase } from './db/index';
import { CaptureEngine } from './capture/engine';
import { installLifecycleHandlers } from './capture/lifecycle';
import { createTray } from './tray';
import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { openMainWindow } from './windows/main-window';
import { registerIpc } from './ipc';

declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// When a second copy of Remirror is launched (e.g. user double-clicks the icon),
// the second instance has already exited above. Focus our existing window instead
// of leaving the user with no feedback.
app.on('second-instance', () => {
  openMainWindow();
});

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(async () => {
  try {
    configureFileTransport(app.getPath('userData'));

    const dbPath = path.join(app.getPath('userData'), 'remirror.db');
    openDatabase(dbPath);

    const engine = new CaptureEngine(getDatabase());

    installLifecycleHandlers(engine);
    registerIpc(engine);
    createTray(engine);
    // (createTray subscribes to engine.on('status', …) for menu rebuild.)
    registerHotkey();

    const isFirstRun = (getDatabase().prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
    if (isFirstRun) {
      log.info('First run — opening onboarding window');
      openMainWindow(); // renderer routes to /onboarding when projects.length === 0
    } else {
      engine.start();
    }

    log.info(`${BRAND.appName} ready`);
  } catch (err) {
    log.error('Fatal startup error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox(
      `${BRAND.appName} failed to start`,
      `${msg}\n\nLogs: ${path.join(app.getPath('userData'), 'logs', 'main.log')}`,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Tray-resident: do nothing on window close.
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  closeDatabase();
});
