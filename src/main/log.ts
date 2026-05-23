// Use the Node-compatible export of electron-log (no hard Electron dependency at
// import time). File-transport path is configured lazily after app is ready.
import log from 'electron-log/node.js';
import path from 'path';

log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

// Wire up the file transport only when Electron's app API is accessible.
// This is called from the main process after app.whenReady() in index.ts.
export function configureFileTransport(userDataPath: string): void {
  if (log.transports.file) {
    log.transports.file.resolvePathFn = () =>
      path.join(userDataPath, 'logs', 'main.log');
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
  }
}

export default log;
