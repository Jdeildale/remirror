import { app, powerMonitor } from 'electron';
import type { CaptureEngine } from './engine';
import log from '../log';

export function installLifecycleHandlers(engine: CaptureEngine): void {
  powerMonitor.on('suspend', () => {
    log.info('System suspended');
    engine.closeActiveNow('suspend');
  });
  powerMonitor.on('lock-screen', () => {
    log.info('Screen locked');
    engine.closeActiveNow('lock-screen');
  });
  powerMonitor.on('resume', () => log.info('System resumed'));
  powerMonitor.on('unlock-screen', () => log.info('Screen unlocked'));

  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    log.info('App quitting — draining engine');
    engine.stopAndDrain().finally(() => app.exit(0));
  });
}
