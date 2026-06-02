// electron-updater is CommonJS-only — in Node ESM (`"type": "module"` in package.json),
// named imports from CJS aren't supported. Use default import + destructure.
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import { BrowserWindow } from 'electron';
import log from './log';
import { IPC } from '@shared/ipc-contract';

/**
 * Initializes the auto-update flow against the configured publish provider
 * (see `electron-builder.yml`). On startup, after a 30s grace period, checks
 * for a newer version. Re-checks every 4 hours while the app is running.
 *
 * Behavior:
 * - `update-available` → starts downloading silently in the background
 * - `update-downloaded` → broadcasts to renderer for an unobtrusive "restart to update" prompt
 * - On `app.quit()`, electron-updater installs the pending update before exit
 *
 * Notes:
 * - Only runs in production (no-op in dev — the `out/` build doesn't include the metadata file)
 * - Skips gracefully if the host (GitHub Releases) is unreachable; logs and retries on next interval
 * - The user can be on a slow connection; downloads do not block the UI
 */
export function setupAutoUpdater(): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('autoUpdater: checking for update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`autoUpdater: update available — ${info.version}`);
    broadcast({ kind: 'update-available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('autoUpdater: no update available');
  });

  autoUpdater.on('download-progress', (p) => {
    log.info(`autoUpdater: download ${Math.round(p.percent)}%`);
    broadcast({ kind: 'download-progress', percent: p.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`autoUpdater: update downloaded — ${info.version}; will install on quit`);
    broadcast({ kind: 'update-downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.warn('autoUpdater error:', err);
  });

  // Initial check after a delay so it doesn't block launch
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => log.warn('checkForUpdates failed:', err));
  }, 30_000);

  // Re-check every 4 hours
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch((err) => log.warn('checkForUpdates failed:', err));
  }, 4 * 60 * 60 * 1000);
}

function broadcast(payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(IPC.UPDATE_STATUS, payload);
    }
  }
}

/** Manually trigger an update check (from IPC). */
export function checkForUpdatesNow(): Promise<unknown> {
  return autoUpdater.checkForUpdates().catch((err) => {
    log.warn('checkForUpdatesNow failed:', err);
    return null;
  });
}

/** Force-restart and install the downloaded update. */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true);
}
