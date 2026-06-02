import { app } from 'electron';
import { store } from './store';
import log from './log';

/**
 * Enables auto-launch on Windows login on first install (one-time).
 *
 * Rationale: Remirror only mirrors your day if it's running. For a tracker,
 * default-on launch-at-login is the right default. But we don't want to fight
 * the user — if they remove it from Windows Startup apps manually, we respect
 * that and never re-add it.
 *
 * The `autoLaunchInitialized` flag in electron-store tracks whether we've
 * already done the one-time setup. Once true, this function is a no-op on
 * future launches, leaving the user in control via Windows Settings → Apps →
 * Startup.
 *
 * In dev (`npm run dev`), `process.execPath` points to Electron's binary
 * inside node_modules — wrong for autostart. So we skip in dev.
 */
export function initAutoLaunchOnce(): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode — don't touch login items
    return;
  }
  const prefs = store.get('autoLaunch') as { initialized?: boolean } | undefined;
  if (prefs?.initialized) {
    log.info('auto-launch: already initialized, skipping');
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true, // start minimized to tray; no window flash on boot
    });
    store.set('autoLaunch', { initialized: true, enabled: true });
    log.info('auto-launch: enabled on first install (open at login, hidden)');
  } catch (err) {
    log.warn('auto-launch: failed to set login item settings', err);
  }
}

/** For Settings UI later — read current OS-level state. */
export function getAutoLaunchState(): { openAtLogin: boolean; openAsHidden: boolean } {
  const s = app.getLoginItemSettings();
  return { openAtLogin: s.openAtLogin, openAsHidden: s.openAsHidden };
}

/** For Settings UI later — let user toggle. */
export function setAutoLaunch(enable: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: enable,
  });
  const cur = (store.get('autoLaunch') as { initialized?: boolean } | undefined) ?? {};
  store.set('autoLaunch', { ...cur, initialized: true, enabled: enable });
  log.info(`auto-launch: user set openAtLogin=${enable}`);
}
