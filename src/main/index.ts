import 'dotenv/config';
import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { BRAND } from '@shared/branding';
import log, { configureFileTransport } from './log';
import { openDatabase, getDatabase, closeDatabase } from './db/index';
import { CaptureEngine } from './capture/engine';
import { installLifecycleHandlers } from './capture/lifecycle';
import { createTray, destroyTray } from './tray';
import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { openMainWindow } from './windows/main-window';
import { registerIpc } from './ipc';
import { CalendarSync } from './calendar/sync';
import { hasStoredAuth } from './google/auth';
import { dailyStatsCache } from './stats/cache';
import { setupAutoUpdater } from './updater';
import { IPC } from '@shared/ipc-contract';

declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
  // eslint-disable-next-line no-var
  var __remirrorCalendarSync: CalendarSync | undefined;
}

let captureEngine: import('./capture/engine').CaptureEngine | null = null;

// When a second copy of Remirror is launched (e.g. user double-clicks the icon),
// the second instance has already exited below. Focus our existing window instead
// of leaving the user with no feedback.
// IMPORTANT: this handler must be registered BEFORE requestSingleInstanceLock().
app.on('second-instance', () => {
  openMainWindow();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.info('Another instance running; exiting');
  app.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(async () => {
  try {
    configureFileTransport(app.getPath('userData'));

    const dbPath = path.join(app.getPath('userData'), 'remirror.db');
    openDatabase(dbPath);

    captureEngine = new CaptureEngine(getDatabase());
    const engine = captureEngine;
    dailyStatsCache.attachEngine(engine);

    installLifecycleHandlers(engine);
    registerIpc(engine);
    createTray(engine);
    // (createTray subscribes to engine.on('status', …) for menu rebuild.)
    registerHotkey();

    const calendarSync = new CalendarSync();
    global.__remirrorCalendarSync = calendarSync;

    // Broadcast OAuth revocation to all renderer windows so the UI can prompt reconnect.
    calendarSync.on('revoked', (lastError: string) => {
      const payload = { connected: false, syncedAt: null, lastError };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.GOOGLE_STATUS_CHANGED, payload);
      }
    });

    if (hasStoredAuth()) {
      calendarSync.start();
    }

    // Hook engine lifecycle: pause calendar sync when capture pauses/stops
    engine.on('status', (status) => {
      if (status === 'active' || status === 'excluded') {
        if (hasStoredAuth()) calendarSync.start();
      } else {
        calendarSync.stop();
      }
    });

    const isFirstRun = (getDatabase().prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
    if (isFirstRun) {
      log.info('First run — opening onboarding window');
      openMainWindow(); // renderer routes to /onboarding when projects.length === 0
    } else {
      engine.start();
    }

    // Auto-update: no-op in dev (no metadata file in out/); checks GitHub Releases in production
    setupAutoUpdater();

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
  // Intentionally no-op. Remirror is tray-resident — closing the only window
  // hides it; only the Quit menu item or `before-quit` should kill the app.
  // DO NOT call app.quit() here — it would break the tray model.
});

app.on('will-quit', () => {
  destroyTray(captureEngine ?? undefined);
  dailyStatsCache.detachEngine();
  global.__remirrorCalendarSync?.stop();
  unregisterAllHotkeys();
  closeDatabase();
});
