import { app } from 'electron';
import { BRAND } from '@shared/branding';
import log from './log';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(() => {
  log.info(`${BRAND.appName} main process ready`);
});

app.on('window-all-closed', () => {
  /* tray-resident; do nothing */
});
