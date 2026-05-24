import { globalShortcut } from 'electron';
import { openMainWindow } from './windows/main-window';
import { store } from './store';
import { BRAND } from '@shared/branding';
import log from './log';

export function registerHotkey(): void {
  const accelerator = store.get('hotkey') ?? BRAND.hotkey.default;
  const ok = globalShortcut.register(accelerator, () => openMainWindow());
  if (!ok) {
    log.warn(`Failed to register hotkey: ${accelerator}`);
  } else {
    log.info(`Hotkey registered: ${accelerator}`);
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
}
