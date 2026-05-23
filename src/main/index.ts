import { app } from 'electron';
import { BRAND } from '@shared/branding';

// Single-instance lock — non-negotiable. Two instances would corrupt the DB.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(() => {
  console.log(`[${BRAND.appName}] main process ready`);
});

app.on('window-all-closed', () => {
  // Remirror lives in the tray — do nothing on window close.
});
