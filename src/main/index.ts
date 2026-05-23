import { app } from 'electron';
import { BRAND } from '@shared/branding';
import log, { configureFileTransport } from './log';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(() => {
  configureFileTransport(app.getPath('userData'));
  log.info(`${BRAND.appName} main process ready`);
});

app.on('window-all-closed', () => {
  /* tray-resident; do nothing */
});
