import { app } from 'electron';
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
  // eslint-disable-next-line no-var
  var __remirrorEngine: CaptureEngine | undefined;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(async () => {
  configureFileTransport(app.getPath('userData'));

  const dbPath = path.join(app.getPath('userData'), 'remirror.db');
  openDatabase(dbPath);

  const engine = new CaptureEngine(getDatabase());
  global.__remirrorEngine = engine;

  installLifecycleHandlers(engine);
  registerIpc(engine);
  createTray(engine);
  // (createTray already subscribes to engine.on('status', …) for menu rebuild.)
  registerHotkey();

  const isFirstRun = (getDatabase().prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
  if (isFirstRun) {
    log.info('First run — opening onboarding window');
    openMainWindow(); // renderer routes to /onboarding when projects.length === 0
  } else {
    engine.start();
  }

  log.info(`${BRAND.appName} ready`);
});

app.on('window-all-closed', () => {
  // Tray-resident: do nothing on window close.
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  closeDatabase();
});
